import type{Incident}from'../monitoring/types.js';import type{RecoveryReadinessSnapshot}from'./readiness-types.js';
export type RecoveryAlertStatus={enabled:boolean;intervalSeconds:number;cooldownSeconds:number;lastEvaluatedAt:string|null;lastState:RecoveryReadinessSnapshot['state']|null;lastError:string;activeIncidentId:string|null};
export type RecoveryAlertEvaluation={trigger:'startup'|'scheduled'|'manual';readiness:RecoveryReadinessSnapshot;incident:Incident|null;evaluatedAt:string};
