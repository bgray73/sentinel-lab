export type RecoveryDrillCheck={id:'manifest'|'restore-copy'|'checksums'|'sqlite'|'json'|'cleanup';name:string;status:'passed'|'failed';detail:string;durationMs:number};
export type RecoveryDrill={id:string;backupId:string;source:'primary'|'replica';trigger:'manual'|'scheduled';startedAt:string;finishedAt:string;durationMs:number;status:'passed'|'failed';checks:RecoveryDrillCheck[];files:number;bytes:number;error?:string};
export type RecoveryDrillData={drills:RecoveryDrill[]};
