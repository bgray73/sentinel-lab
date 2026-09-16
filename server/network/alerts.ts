import { createHash } from "node:crypto";
import type { MonitoringService } from "../monitoring/service.js";
import type { Incident } from "../monitoring/types.js";
import type {
  NetworkAlertEvaluation,
  NetworkAlertState,
  NetworkAlertStatus,
} from "./alert-types.js";
import type { NetworkService } from "./service.js";
import type { NetworkInterface } from "./types.js";

type IncidentSink = Pick<
  MonitoringService,
  "ready" | "reconcileSystemIncident" | "incidents"
>;
type NetworkSource = Pick<NetworkService, "ready" | "snapshot">;
type Trigger = NetworkAlertEvaluation["trigger"];

export class NetworkAlertService {
  readonly ready: Promise<void>;
  private timer?: NodeJS.Timeout;
  private queue?: Promise<NetworkAlertEvaluation>;
  private lastEvaluatedAt: string | null = null;
  private lastState: NetworkAlertState | null = null;
  private lastError = "";
  private eligibleInterfaces = 0;
  private readonly enabled: boolean;
  private readonly intervalSeconds: number;
  private readonly cooldownSeconds: number;

  constructor(
    private readonly network: NetworkSource,
    private readonly monitoring: IncidentSink,
    env: NodeJS.ProcessEnv = process.env,
    schedule = true,
  ) {
    this.enabled = env.SENTINEL_NETWORK_ALERTS_ENABLED === "true";
    this.intervalSeconds = integer(
      env.SENTINEL_NETWORK_ALERT_INTERVAL_SECONDS,
      60,
      30,
      86_400,
    );
    this.cooldownSeconds = integer(
      env.SENTINEL_NETWORK_ALERT_COOLDOWN_SECONDS,
      3600,
      60,
      604_800,
    );
    this.ready = this.initialize(schedule);
  }

  private async initialize(schedule: boolean) {
    await Promise.all([this.network.ready, this.monitoring.ready]);
    if (schedule && this.enabled) {
      await this.evaluate("startup").catch(() => undefined);
      this.timer = setInterval(
        () => void this.evaluate("scheduled").catch(() => undefined),
        this.intervalSeconds * 1000,
      );
      this.timer.unref();
    }
  }

  status(): NetworkAlertStatus {
    return {
      enabled: this.enabled,
      intervalSeconds: this.intervalSeconds,
      cooldownSeconds: this.cooldownSeconds,
      lastEvaluatedAt: this.lastEvaluatedAt,
      lastState: this.lastState,
      lastError: this.lastError,
      eligibleInterfaces: this.eligibleInterfaces,
      activeIncidents: this.active().length,
    };
  }

  snapshot() {
    return { status: this.status(), incidents: this.active() };
  }

  evaluate(trigger: Trigger = "manual") {
    if (!this.enabled) throw new Error("Network interface alerts are disabled");
    if (!this.queue)
      this.queue = this.perform(trigger).finally(() => {
        this.queue = undefined;
      });
    return this.queue;
  }

  close() {
    if (this.timer) clearInterval(this.timer);
  }

  async prometheus() {
    await this.ready;
    const status = this.status();
    return `# HELP sentinel_network_alerts_enabled Whether network interface incident automation is enabled\n# TYPE sentinel_network_alerts_enabled gauge\nsentinel_network_alerts_enabled ${status.enabled ? 1 : 0}\n# HELP sentinel_network_alert_active_incidents Active network interface incidents\n# TYPE sentinel_network_alert_active_incidents gauge\nsentinel_network_alert_active_incidents ${status.activeIncidents}\n# HELP sentinel_network_alert_monitor_error Whether the last network alert evaluation failed\n# TYPE sentinel_network_alert_monitor_error gauge\nsentinel_network_alert_monitor_error ${status.lastError ? 1 : 0}\n`;
  }

  private active() {
    return this.monitoring
      .incidents()
      .filter(
        (item) =>
          item.ruleId.startsWith("system-network-interface-") &&
          item.status !== "resolved",
      );
  }
  private key(item: NetworkInterface) {
    return `network-interface-${createHash("sha256").update(`${item.deviceId}|${item.ifIndex}`).digest("hex").slice(0, 16)}`;
  }
  private detail(item: NetworkInterface) {
    const reasons: string[] = [];
    if (item.adminState === "up" && item.operState !== "up")
      reasons.push(`operational state is ${item.operState}`);
    if (item.utilizationPercent !== null && item.utilizationPercent > 0)
      reasons.push(`utilization is ${item.utilizationPercent}%`);
    const errors = (item.errorsPerSecond || 0) + (item.discardsPerSecond || 0);
    if (errors > 0)
      reasons.push(
        `combined errors and discards are ${Number(errors.toFixed(2))}/s`,
      );
    if (item.flapsInWindow > 0)
      reasons.push(
        `${item.flapsInWindow} recent link transitions were detected`,
      );
    return `${item.deviceName} ${item.name}${item.alias ? ` (${item.alias})` : ""} is ${item.health}. ${reasons.join("; ") || "The interface exceeded the configured health policy"}.`;
  }

  private async perform(trigger: Trigger) {
    try {
      const response = this.network.snapshot();
      if (!response.current)
        throw new Error("Network interface snapshot is not available");
      const network = response.current;
      const eligible = network.interfaces.filter(
        (item) => item.health === "warning" || item.health === "critical",
      );
      const keys = new Set(eligible.map((item) => this.key(item)));
      const incidents: (Incident | null)[] = [];
      for (const item of eligible)
        incidents.push(
          await this.monitoring.reconcileSystemIncident({
            key: this.key(item),
            state: item.health === "critical" ? "not-ready" : "at-risk",
            summary: this.detail(item),
            cooldownSeconds: this.cooldownSeconds,
            title: `${item.deviceName} ${item.name} is ${item.health === "critical" ? "critical" : "degraded"}`,
          }),
        );
      for (const incident of this.active()) {
        const key = incident.ruleId.replace(/^system-/, "");
        if (!keys.has(key))
          incidents.push(
            await this.monitoring.reconcileSystemIncident({
              key,
              state: "ready",
              summary:
                "The interface returned to healthy state or no longer meets the network alert policy.",
              cooldownSeconds: this.cooldownSeconds,
              title: incident.title,
            }),
          );
      }
      const state: NetworkAlertState = eligible.some(
        (item) => item.health === "critical",
      )
        ? "critical"
        : eligible.length
          ? "warning"
          : "healthy";
      this.lastEvaluatedAt = new Date().toISOString();
      this.lastState = state;
      this.lastError = "";
      this.eligibleInterfaces = eligible.length;
      return {
        trigger,
        state,
        network,
        incidents,
        evaluatedAt: this.lastEvaluatedAt,
      };
    } catch (error) {
      this.lastError =
        error instanceof Error
          ? error.message
          : "Network alert evaluation failed";
      throw error;
    }
  }
}

function integer(
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) {
  const result = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(result) || result < min || result > max)
    throw new Error(
      `Network alert setting must be an integer from ${min} to ${max}`,
    );
  return result;
}
