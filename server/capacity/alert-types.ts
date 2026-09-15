import type{Incident}from'../monitoring/types.js';import type{CapacityConfidence,CapacityForecastSnapshot}from'./types.js';
export type CapacityAlertState='healthy'|'warning'|'critical';
export type CapacityAlertStatus={enabled:boolean;intervalSeconds:number;cooldownSeconds:number;minimumConfidence:CapacityConfidence;lastEvaluatedAt:string|null;lastState:CapacityAlertState|null;lastError:string;eligibleForecasts:number;activeIncidents:number};
export type CapacityAlertEvaluation={trigger:'startup'|'scheduled'|'manual';state:CapacityAlertState;forecast:CapacityForecastSnapshot;incidents:(Incident|null)[];evaluatedAt:string};
