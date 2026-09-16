export type InterfaceState =
  | "up"
  | "down"
  | "testing"
  | "dormant"
  | "not-present"
  | "lower-layer-down"
  | "unknown";
export type InterfaceHealth =
  "healthy" | "warning" | "critical" | "disabled" | "unknown";
export type NetworkCounter = {
  key: string;
  deviceId: string;
  ifIndex: string;
  adminValue: number | null;
  operValue: number | null;
  inOctets: number | null;
  outOctets: number | null;
  inErrors: number | null;
  outErrors: number | null;
  inDiscards: number | null;
  outDiscards: number | null;
  collectedAt: string;
};
export type NetworkFlap = {
  id: string;
  key: string;
  deviceId: string;
  deviceName: string;
  ifIndex: string;
  interfaceName: string;
  from: InterfaceState;
  to: InterfaceState;
  detectedAt: string;
};
export type NetworkInterface = {
  key: string;
  deviceId: string;
  deviceName: string;
  managementAddress: string;
  ifIndex: string;
  name: string;
  alias: string;
  adminState: InterfaceState;
  operState: InterfaceState;
  health: InterfaceHealth;
  speedMbps: number | null;
  rxBytesPerSecond: number | null;
  txBytesPerSecond: number | null;
  utilizationPercent: number | null;
  errorsPerSecond: number | null;
  discardsPerSecond: number | null;
  flapsInWindow: number;
  lastChangeSeconds: number | null;
  collectedAt: string;
};
export type NetworkSnapshot = {
  mode: "simulation" | "live";
  collectedAt: string;
  interfaces: NetworkInterface[];
  flaps: NetworkFlap[];
  collectionErrors: string[];
  summary: {
    devices: number;
    interfaces: number;
    up: number;
    down: number;
    disabled: number;
    warning: number;
    critical: number;
    highUtilization: number;
    erroring: number;
    recentFlaps: number;
  };
};
export type NetworkData = {
  counters: NetworkCounter[];
  snapshot: NetworkSnapshot | null;
  flaps: NetworkFlap[];
};
export type NetworkThresholds = {
  utilizationWarningPercent: number;
  utilizationCriticalPercent: number;
  errorsWarningPerSecond: number;
  errorsCriticalPerSecond: number;
  flapWindowMinutes: number;
  flapWarningCount: number;
};
