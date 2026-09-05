import type { HealthStatus } from '../proxmox/types.js';

export type PbsFinding={id:string;category:'datastore'|'snapshot'|'verification'|'task'|'gc'|'collection';severity:'warning'|'critical';title:string;detail:string;resourceId?:string};
export type PbsDatastore={name:string;usedBytes:number;totalBytes:number;availableBytes:number;usagePercent:number;health:HealthStatus;snapshots:number;groups:number;newestSnapshotAt:string|null;newestAgeHours:number|null;verified:number;unverified:number;verificationFailed:number};
export type PbsTask={id:string;type:string;workerId:string;user:string;status:string;startedAt:string;endedAt?:string;durationSeconds?:number};
export type PbsJob={id:string;kind:'sync'|'prune';store:string;schedule:string;enabled:boolean};
export type PbsHealthSnapshot={mode:'simulation'|'live';collectedAt:string;serverName:string;health:HealthStatus;datastores:PbsDatastore[];recentTasks:PbsTask[];jobs:PbsJob[];findings:PbsFinding[];collectionErrors:string[];summary:{datastores:number;snapshots:number;groups:number;unverified:number;verificationFailed:number;failedTasks24h:number;syncJobs:number;pruneJobs:number;storagePressure:number}};
export type PbsData={snapshots:PbsHealthSnapshot[]};
export type PbsUsageApi={store?:string;total?:number;used?:number;avail?:number};
export type PbsSnapshotApi={'backup-type'?:string;'backup-id'?:string;'backup-time'?:number;size?:number;verification?:{state?:string};protected?:boolean};
export type PbsTaskApi={upid?:string;worker_type?:string;worker_id?:string;'worker-type'?:string;'worker-id'?:string;user?:string;status?:string;starttime?:number;endtime?:number};
export type PbsJobApi={id?:string;store?:string;schedule?:string;disable?:boolean};
