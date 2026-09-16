import { parsePrometheus, type Metric } from "../hardware/snmp.js";
import type { SnmpTarget } from "../hardware/types.js";
import type {
  InterfaceHealth,
  InterfaceState,
  NetworkCounter,
  NetworkFlap,
  NetworkInterface,
  NetworkThresholds,
} from "./types.js";
const state = (value: number | null): InterfaceState =>
  value === 1
    ? "up"
    : value === 2
      ? "down"
      : value === 3
        ? "testing"
        : value === 5
          ? "dormant"
          : value === 6
            ? "not-present"
            : value === 7
              ? "lower-layer-down"
              : "unknown";
const rounded = (value: number, digits = 2) => Number(value.toFixed(digits));
export async function scrapeNetwork(
  exporter: string,
  target: SnmpTarget,
  timeoutMs = 10_000,
) {
  const endpoint = new URL(`${exporter}/snmp`);
  endpoint.searchParams.set("target", target.target);
  endpoint.searchParams.set("module", target.module);
  endpoint.searchParams.set("auth", target.auth);
  const response = await fetch(endpoint, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok)
    throw new Error(
      `${target.name} interface scrape failed with HTTP ${response.status}`,
    );
  return parsePrometheus(await response.text());
}
export function normalizeInterfaces(
  target: SnmpTarget,
  metrics: Metric[],
  previous: NetworkCounter[],
  flaps: NetworkFlap[],
  thresholds: NetworkThresholds,
  collectedAt = new Date().toISOString(),
) {
  const byName = (name: string) => metrics.filter((item) => item.name === name),
    indexes = new Set(
      metrics.flatMap((item) =>
        item.labels.ifIndex ? [item.labels.ifIndex] : [],
      ),
    ),
    now = new Date(collectedAt).getTime(),
    flapCutoff = now - thresholds.flapWindowMinutes * 60_000;
  const counters: NetworkCounter[] = [];
  const interfaces: NetworkInterface[] = [];
  const value = (name: string, index: string) =>
    byName(name).find((item) => item.labels.ifIndex === index)?.value ?? null;
  const labels = (index: string) =>
    Object.assign(
      {},
      ...metrics
        .filter((item) => item.labels.ifIndex === index)
        .map((item) => item.labels),
    );
  for (const ifIndex of indexes) {
    const meta = labels(ifIndex),
      key = `${target.id}/${ifIndex}`,
      adminValue = value("ifAdminStatus", ifIndex),
      operValue = value("ifOperStatus", ifIndex),
      adminState = state(adminValue),
      operState = state(operValue),
      prior = previous.find((item) => item.key === key),
      elapsed = prior
        ? (now - new Date(prior.collectedAt).getTime()) / 1000
        : 0;
    const counter = (preferred: string, fallback: string) =>
        value(preferred, ifIndex) ?? value(fallback, ifIndex),
      rate = (current: number | null, old: number | null) =>
        elapsed > 0 && current !== null && old !== null && current >= old
          ? (current - old) / elapsed
          : null;
    const inOctets = counter("ifHCInOctets", "ifInOctets"),
      outOctets = counter("ifHCOutOctets", "ifOutOctets"),
      inErrors = value("ifInErrors", ifIndex),
      outErrors = value("ifOutErrors", ifIndex),
      inDiscards = value("ifInDiscards", ifIndex),
      outDiscards = value("ifOutDiscards", ifIndex),
      rx = rate(inOctets, prior?.inOctets ?? null),
      tx = rate(outOctets, prior?.outOctets ?? null),
      errorRates = [
        rate(inErrors, prior?.inErrors ?? null),
        rate(outErrors, prior?.outErrors ?? null),
      ].filter((item): item is number => item !== null),
      discardRates = [
        rate(inDiscards, prior?.inDiscards ?? null),
        rate(outDiscards, prior?.outDiscards ?? null),
      ].filter((item): item is number => item !== null),
      errors = errorRates.reduce((sum, item) => sum + item, 0),
      discards = discardRates.reduce((sum, item) => sum + item, 0),
      speedMbps =
        (value("ifHighSpeed", ifIndex) ??
          (value("ifSpeed", ifIndex) || 0) / 1_000_000) ||
        null,
      utilization =
        speedMbps && rx !== null && tx !== null
          ? ((Math.max(rx, tx) * 8) / (speedMbps * 1_000_000)) * 100
          : null,
      name = meta.ifName || meta.ifDescr || `Interface ${ifIndex}`,
      alias = meta.ifAlias || "";
    if (prior && state(prior.operValue) !== operState && adminState === "up")
      flaps.push({
        id: `flap-${crypto.randomUUID()}`,
        key,
        deviceId: target.id,
        deviceName: target.name,
        ifIndex,
        interfaceName: name,
        from: state(prior.operValue),
        to: operState,
        detectedAt: collectedAt,
      });
    const flapCount = flaps.filter(
      (item) =>
        item.key === key && new Date(item.detectedAt).getTime() >= flapCutoff,
    ).length;
    let health: InterfaceHealth =
      adminState === "down"
        ? "disabled"
        : adminState !== "up"
          ? "unknown"
          : operState !== "up"
            ? "critical"
            : "healthy";
    if (
      health === "healthy" &&
      ((utilization ?? 0) >= thresholds.utilizationCriticalPercent ||
        errors + discards >= thresholds.errorsCriticalPerSecond)
    )
      health = "critical";
    else if (
      health === "healthy" &&
      ((utilization ?? 0) >= thresholds.utilizationWarningPercent ||
        errors + discards >= thresholds.errorsWarningPerSecond ||
        flapCount >= thresholds.flapWarningCount)
    )
      health = "warning";
    counters.push({
      key,
      deviceId: target.id,
      ifIndex,
      adminValue,
      operValue,
      inOctets,
      outOctets,
      inErrors,
      outErrors,
      inDiscards,
      outDiscards,
      collectedAt,
    });
    interfaces.push({
      key,
      deviceId: target.id,
      deviceName: target.name,
      managementAddress: target.target,
      ifIndex,
      name,
      alias,
      adminState,
      operState,
      health,
      speedMbps,
      rxBytesPerSecond: rx === null ? null : rounded(rx),
      txBytesPerSecond: tx === null ? null : rounded(tx),
      utilizationPercent: utilization === null ? null : rounded(utilization),
      errorsPerSecond: errorRates.length ? rounded(errors) : null,
      discardsPerSecond: discardRates.length ? rounded(discards) : null,
      flapsInWindow: flapCount,
      lastChangeSeconds:
        value("ifLastChange", ifIndex) !== null
          ? rounded((value("ifLastChange", ifIndex) || 0) / 100)
          : null,
      collectedAt,
    });
  }
  return {
    interfaces,
    counters,
    flaps: flaps
      .filter(
        (item) => new Date(item.detectedAt).getTime() >= now - 30 * 86_400_000,
      )
      .slice(-2_000),
  };
}
