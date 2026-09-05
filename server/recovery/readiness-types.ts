export type RecoveryReadinessState='ready'|'at-risk'|'not-ready';
export type RecoveryReadinessCheckStatus='passed'|'warning'|'failed'|'skipped';
export type RecoveryReadinessCheck={id:'backup-rpo'|'verification'|'replica'|'application-drill'|'guest-drill'|'pbs';name:string;status:RecoveryReadinessCheckStatus;required:boolean;weight:number;detail:string;observedAt:string|null};
export type RecoveryReadinessPolicy={rpoHours:number;applicationDrillMaxAgeDays:number;guestDrillMaxAgeDays:number;requireReplica:boolean;requireGuestDrill:boolean;requirePbs:boolean};
export type RecoveryReadinessSnapshot={evaluatedAt:string;state:RecoveryReadinessState;score:number;policy:RecoveryReadinessPolicy;checks:RecoveryReadinessCheck[];summary:{passed:number;warning:number;failed:number;skipped:number;requiredFailures:number}};
