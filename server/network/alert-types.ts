import type { Incident } from "../monitoring/types.js";
import type { NetworkSnapshot } from "./types.js";

export type NetworkAlertState = "healthy" | "warning" | "critical";
export type NetworkAlertStatus = {
  enabled: boolean;
  intervalSeconds: number;
  cooldownSeconds: number;
  lastEvaluatedAt: string | null;
  lastState: NetworkAlertState | null;
  lastError: string;
  eligibleInterfaces: number;
  activeIncidents: number;
};
export type NetworkAlertEvaluation = {
  trigger: "startup" | "scheduled" | "manual";
  state: NetworkAlertState;
  network: NetworkSnapshot;
  incidents: (Incident | null)[];
  evaluatedAt: string;
};
