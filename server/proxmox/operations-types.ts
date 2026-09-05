import type { HealthStatus } from './types.js';

export type ProxmoxOperationalFinding = {
  id: string;
  category: 'quorum' | 'node' | 'storage' | 'task' | 'backup' | 'ha' | 'replication' | 'collection';
  severity: 'warning' | 'critical';
  title: string;
  detail: string;
  resourceId?: string;
};

export type ProxmoxStorageHealth = { id:string; name:string; node:string; state:string; usedBytes:number; totalBytes:number; usagePercent:number; health:HealthStatus };
export type ProxmoxTaskHealth = { id:string; node:string; type:string; user:string; status:string; startedAt:string; endedAt?:string; durationSeconds?:number };
export type ProxmoxHaHealth = { id:string; kind:'node'|'service'; node:string; state:string; health:HealthStatus };
export type ProxmoxReplicationHealth = { id:string; source:string; target:string; schedule:string; enabled:boolean };

export type ProxmoxOperationsSnapshot = {
  mode: 'simulation' | 'live';
  collectedAt: string;
  clusterName: string;
  health: HealthStatus;
  quorum: { quorate:boolean|null; nodesOnline:number; nodesTotal:number; expectedVotes:number|null; totalVotes:number|null };
  storage: ProxmoxStorageHealth[];
  recentTasks: ProxmoxTaskHealth[];
  backup: { lastSuccessfulAt:string|null; ageHours:number|null; successful24h:number; failed24h:number; health:HealthStatus };
  ha: ProxmoxHaHealth[];
  replication: ProxmoxReplicationHealth[];
  findings: ProxmoxOperationalFinding[];
  collectionErrors: string[];
  summary: { warnings:number; critical:number; storagePressure:number; failedTasks24h:number; haProblems:number; replicationJobs:number };
};

export type ProxmoxOperationsData = { snapshots:ProxmoxOperationsSnapshot[] };

export type ProxmoxClusterStatus = { type:string; name?:string; node?:string; online?:number; quorate?:number; nodes?:number; expected_votes?:number; total_votes?:number };
export type ProxmoxClusterTask = { upid?:string; id?:string; node?:string; type?:string; user?:string; status?:string; starttime?:number; endtime?:number };
export type ProxmoxHaStatus = { type?:string; sid?:string; id?:string; node?:string; status?:string };
export type ProxmoxReplicationJob = { id?:string; source?:string; target?:string; schedule?:string; disable?:number };
