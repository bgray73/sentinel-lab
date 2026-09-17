import path from "node:path";
import { snmpConfigFromEnvironment } from "../hardware/snmp.js";
import { normalizeInterfaces, scrapeNetwork } from "./collector.js";
import { NetworkStore } from "./store.js";
import type {
  NetworkData,
  NetworkInterface,
  NetworkSnapshot,
  NetworkThresholds,
} from "./types.js";
export class NetworkService {
  private data: NetworkData = { counters: [], snapshot: null, flaps: [] };
  private readonly store: NetworkStore;
  private readonly live: boolean;
  private readonly intervalSeconds: number;
  private readonly timeoutMs: number;
  private readonly thresholds: NetworkThresholds;
  private collecting?: Promise<NetworkSnapshot>;
  private lastError = "";
  readonly ready: Promise<void>;
  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.live = env.SENTINEL_REAL_NETWORK === "true";
    this.intervalSeconds = integer(
      env.SENTINEL_NETWORK_INTERVAL_SECONDS,
      60,
      30,
      3600,
    );
    this.timeoutMs = integer(
      env.SENTINEL_NETWORK_TIMEOUT_MS,
      8000,
      1000,
      60_000,
    );
    this.thresholds = thresholds(env);
    this.store = new NetworkStore(
      env.SENTINEL_NETWORK_FILE || path.resolve(".sentinel/network.json"),
    );
    this.ready = this.initialize();
  }
  private async initialize() {
    this.data = await this.store.load();
    try {
      await this.collect();
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Network collection failed";
    }
    const timer = setInterval(
      () =>
        void this.collect().catch((error) => {
          this.lastError =
            error instanceof Error
              ? error.message
              : "Network collection failed";
        }),
      this.intervalSeconds * 1000,
    );
    timer.unref();
  }
  status() {
    let targets = 0;
    let exporter = false;
    try {
      const config = snmpConfigFromEnvironment(this.env);
      exporter = Boolean(config.exporter);
      targets = config.targets.filter(
        (item) => item.category === "switch" || item.category === "router",
      ).length;
    } catch {}
    return {
      mode: this.live ? "live" : "simulation",
      configured: this.live && exporter && targets > 0,
      intervalSeconds: this.intervalSeconds,
      lastCollectedAt: this.data.snapshot?.collectedAt || null,
      lastError: this.lastError,
      targets,
      thresholds: this.thresholds,
    };
  }
  snapshot() {
    return { status: this.status(), current: this.data.snapshot };
  }
  collect() {
    if (!this.collecting)
      this.collecting = this.performCollect().finally(() => {
        this.collecting = undefined;
      });
    return this.collecting;
  }
  prometheus() {
    const current = this.data.snapshot;
    if (!current) return "";
    const escape = (value: string) =>
      value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "");
    const lines = [
      "# HELP sentinel_network_interface_health Interface health state (1 for current state).",
      "# TYPE sentinel_network_interface_health gauge",
      "# HELP sentinel_network_interface_utilization_percent Estimated maximum-direction interface utilization.",
      "# TYPE sentinel_network_interface_utilization_percent gauge",
      "# HELP sentinel_network_interface_errors_per_second Interface errors per second.",
      "# TYPE sentinel_network_interface_errors_per_second gauge",
      "# HELP sentinel_network_interface_flaps_recent Link state changes inside the configured flap window.",
      "# TYPE sentinel_network_interface_flaps_recent gauge",
    ];
    for (const item of current.interfaces) {
      const label = `device="${escape(item.deviceName)}",device_id="${escape(item.deviceId)}",interface="${escape(item.name)}",if_index="${escape(item.ifIndex)}"`;
      lines.push(
        `sentinel_network_interface_health{${label},state="${item.health}"} 1`,
      );
      if (item.utilizationPercent !== null)
        lines.push(
          `sentinel_network_interface_utilization_percent{${label}} ${item.utilizationPercent}`,
        );
      if (item.errorsPerSecond !== null)
        lines.push(
          `sentinel_network_interface_errors_per_second{${label}} ${item.errorsPerSecond}`,
        );
      lines.push(
        `sentinel_network_interface_flaps_recent{${label}} ${item.flapsInWindow}`,
      );
    }
    return `${lines.join("\n")}\n`;
  }
  private async performCollect() {
    const collectedAt = new Date().toISOString();
    if (!this.live) {
      const interfaces = simulated(collectedAt);
      const snapshot = summarize(
        "simulation",
        interfaces,
        this.data.flaps,
        [],
        collectedAt,
      );
      this.data = { counters: [], snapshot, flaps: this.data.flaps };
      await this.store.save(this.data);
      this.lastError = "";
      return snapshot;
    }
    const config = snmpConfigFromEnvironment(this.env),
      targets = config.targets.filter(
        (item) => item.category === "switch" || item.category === "router",
      );
    if (!config.exporter || !targets.length)
      throw new Error(
        "Live network monitoring requires an SNMP exporter and at least one switch or router target",
      );
    const results = await Promise.allSettled(
        targets.map(async (target) =>
          normalizeInterfaces(
            target,
            await scrapeNetwork(config.exporter!, target, this.timeoutMs),
            this.data.counters,
            [...this.data.flaps],
            this.thresholds,
            collectedAt,
          ),
        ),
      ),
      interfaces: NetworkInterface[] = [],
      counters = [] as NetworkData["counters"],
      errors: string[] = [];
    const flapMap = new Map(this.data.flaps.map((item) => [item.id, item]));
    results.forEach((result, index) => {
      if (result.status === "fulfilled") {
        interfaces.push(...result.value.interfaces);
        counters.push(...result.value.counters);
        result.value.flaps.forEach((item) => flapMap.set(item.id, item));
      } else
        errors.push(
          `${targets[index].name}: ${result.reason instanceof Error ? result.reason.message : "collection failed"}`,
        );
    });
    if (!interfaces.length && errors.length) throw new Error(errors.join("; "));
    const flaps = [...flapMap.values()]
        .sort((a, b) => a.detectedAt.localeCompare(b.detectedAt))
        .filter(
          (item) =>
            new Date(item.detectedAt).getTime() >= Date.now() - 30 * 86_400_000,
        )
        .slice(-2_000),
      snapshot = summarize("live", interfaces, flaps, errors, collectedAt);
    this.data = { counters, snapshot, flaps };
    await this.store.save(this.data);
    this.lastError = errors.join("; ");
    return snapshot;
  }
}
function thresholds(env: NodeJS.ProcessEnv): NetworkThresholds {
  const value = (key: string, fallback: number, min: number, max: number) =>
      number(env[key], fallback, min, max, key),
    result = {
      utilizationWarningPercent: value(
        "SENTINEL_NETWORK_UTIL_WARNING_PERCENT",
        70,
        1,
        99,
      ),
      utilizationCriticalPercent: value(
        "SENTINEL_NETWORK_UTIL_CRITICAL_PERCENT",
        90,
        2,
        100,
      ),
      errorsWarningPerSecond: value(
        "SENTINEL_NETWORK_ERROR_WARNING_PER_SECOND",
        1,
        0,
        100_000,
      ),
      errorsCriticalPerSecond: value(
        "SENTINEL_NETWORK_ERROR_CRITICAL_PER_SECOND",
        100,
        0.01,
        1_000_000,
      ),
      flapWindowMinutes: value(
        "SENTINEL_NETWORK_FLAP_WINDOW_MINUTES",
        15,
        1,
        1440,
      ),
      flapWarningCount: integer(
        env.SENTINEL_NETWORK_FLAP_WARNING_COUNT,
        3,
        1,
        100,
      ),
    };
  if (
    result.utilizationWarningPercent >= result.utilizationCriticalPercent ||
    result.errorsWarningPerSecond >= result.errorsCriticalPerSecond
  )
    throw new Error("Network warning and critical thresholds are inconsistent");
  return result;
}
function number(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
  key: string,
) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(result) || result < min || result > max)
    throw new Error(`${key} must be between ${min} and ${max}`);
  return result;
}
function integer(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result < min || result > max)
    throw new Error(`Network setting must be an integer from ${min} to ${max}`);
  return result;
}
function summarize(
  mode: "simulation" | "live",
  interfaces: NetworkInterface[],
  flaps: NetworkData["flaps"],
  collectionErrors: string[],
  collectedAt: string,
): NetworkSnapshot {
  return {
    mode,
    collectedAt,
    interfaces,
    flaps: flaps.slice(-100).reverse(),
    collectionErrors,
    summary: {
      devices: new Set(interfaces.map((item) => item.deviceId)).size,
      interfaces: interfaces.length,
      up: interfaces.filter((item) => item.operState === "up").length,
      down: interfaces.filter(
        (item) => item.adminState === "up" && item.operState !== "up",
      ).length,
      disabled: interfaces.filter((item) => item.health === "disabled").length,
      warning: interfaces.filter((item) => item.health === "warning").length,
      critical: interfaces.filter((item) => item.health === "critical").length,
      highUtilization: interfaces.filter(
        (item) => (item.utilizationPercent || 0) >= 70,
      ).length,
      erroring: interfaces.filter(
        (item) =>
          (item.errorsPerSecond || 0) + (item.discardsPerSecond || 0) > 0,
      ).length,
      recentFlaps: interfaces.reduce(
        (sum, item) => sum + item.flapsInWindow,
        0,
      ),
    },
  };
}
function simulated(collectedAt: string): NetworkInterface[] {
  const values = [
    [
      "nexus-core-01",
      "nexus-core-01",
      "10.20.0.2",
      "1",
      "Ethernet1/1",
      "pve-01 40G uplink",
      40000,
      18.4,
    ],
    [
      "nexus-core-01",
      "nexus-core-01",
      "10.20.0.2",
      "2",
      "Ethernet1/2",
      "pve-02 40G uplink",
      40000,
      24.1,
    ],
    [
      "nexus-core-01",
      "nexus-core-01",
      "10.20.0.2",
      "3",
      "Ethernet1/3",
      "pve-03 40G uplink",
      40000,
      12.7,
    ],
    [
      "nexus-core-01",
      "nexus-core-01",
      "10.20.0.2",
      "4",
      "Ethernet1/4",
      "storage-01 PBS 40G uplink",
      40000,
      31.6,
    ],
    [
      "ucg-fiber",
      "ucg-fiber",
      "192.168.1.1",
      "1",
      "WAN",
      "Verizon Fios",
      1000,
      42.8,
    ],
    [
      "ucg-fiber",
      "ucg-fiber",
      "192.168.1.1",
      "2",
      "LAN10G",
      "Nexus uplink",
      10000,
      8.2,
    ],
  ] as const;
  return values.map(
    ([
      deviceId,
      deviceName,
      managementAddress,
      ifIndex,
      name,
      alias,
      speedMbps,
      utilizationPercent,
    ]) => ({
      key: `${deviceId}/${ifIndex}`,
      deviceId,
      deviceName,
      managementAddress,
      ifIndex,
      name,
      alias,
      adminState: "up",
      operState: "up",
      health: "healthy",
      speedMbps,
      rxBytesPerSecond: Math.round(
        (((speedMbps * 1_000_000) / 8) * utilizationPercent) / 100,
      ),
      txBytesPerSecond: Math.round(
        (((speedMbps * 1_000_000) / 8) * utilizationPercent) / 200,
      ),
      utilizationPercent,
      errorsPerSecond: 0,
      discardsPerSecond: 0,
      flapsInWindow: 0,
      lastChangeSeconds: 86400,
      collectedAt,
    }),
  );
}
