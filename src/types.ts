export type Kind = 'frontend' | 'api' | 'container' | 'livenx' | 'livewire';
export type Test = { id: string; name: string; kind: Kind; target: string; critical: boolean; timeoutMs: number };
export type Result = Test & { status: 'passed' | 'failed'; latency: number; detail: string; timestamp: string };
export type Gate = { status: 'ready' | 'blocked'; score: number; passed: number; total: number; criticalFailures: number; minScore: number };
export type Run = { id: string; startedAt: string; duration: number; results: Result[]; gate: Gate };

export type ResourceType = 'node' | 'qemu' | 'lxc' | 'storage';
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';
export type ProxmoxResource = {
  id: string;
  type: ResourceType;
  name: string;
  node?: string;
  vmid?: number;
  parentId?: string;
  state: string;
  health: HealthStatus;
  uptimeSeconds?: number;
  cpuPercent?: number;
  memoryUsedBytes?: number;
  memoryTotalBytes?: number;
  diskUsedBytes?: number;
  diskTotalBytes?: number;
};
export type ProxmoxInventory = {
  source: 'simulation' | 'proxmox';
  collectedAt: string;
  clusterName: string;
  resources: ProxmoxResource[];
  summary: {
    nodes: number;
    virtualMachines: number;
    lxcContainers: number;
    storagePools: number;
    runningWorkloads: number;
    stoppedWorkloads: number;
    warnings: number;
  };
};
export type ProxmoxOperationalFinding={id:string;category:'quorum'|'node'|'storage'|'task'|'backup'|'ha'|'replication'|'collection';severity:'warning'|'critical';title:string;detail:string;resourceId?:string};
export type ProxmoxStorageHealth={id:string;name:string;node:string;state:string;usedBytes:number;totalBytes:number;usagePercent:number;health:HealthStatus};
export type ProxmoxTaskHealth={id:string;node:string;type:string;user:string;status:string;startedAt:string;endedAt?:string;durationSeconds?:number};
export type ProxmoxHaHealth={id:string;kind:'node'|'service';node:string;state:string;health:HealthStatus};
export type ProxmoxReplicationHealth={id:string;source:string;target:string;schedule:string;enabled:boolean};
export type ProxmoxOperationsSnapshot={mode:'simulation'|'live';collectedAt:string;clusterName:string;health:HealthStatus;quorum:{quorate:boolean|null;nodesOnline:number;nodesTotal:number;expectedVotes:number|null;totalVotes:number|null};storage:ProxmoxStorageHealth[];recentTasks:ProxmoxTaskHealth[];backup:{lastSuccessfulAt:string|null;ageHours:number|null;successful24h:number;failed24h:number;health:HealthStatus};ha:ProxmoxHaHealth[];replication:ProxmoxReplicationHealth[];findings:ProxmoxOperationalFinding[];collectionErrors:string[];summary:{warnings:number;critical:number;storagePressure:number;failedTasks24h:number;haProblems:number;replicationJobs:number}};
export type ProxmoxOperationsResponse={status:{mode:'simulation'|'live';intervalSeconds:number;retentionDays:number;backupWarningHours:number;backupCriticalHours:number;storageWarningPercent:number;storageCriticalPercent:number;lastCollectedAt:string|null};current:ProxmoxOperationsSnapshot|null;history:ProxmoxOperationsSnapshot[]};
export type PbsFinding={id:string;category:'datastore'|'snapshot'|'verification'|'task'|'gc'|'collection';severity:'warning'|'critical';title:string;detail:string;resourceId?:string};
export type PbsDatastore={name:string;usedBytes:number;totalBytes:number;availableBytes:number;usagePercent:number;health:HealthStatus;snapshots:number;groups:number;newestSnapshotAt:string|null;newestAgeHours:number|null;verified:number;unverified:number;verificationFailed:number};
export type PbsTask={id:string;type:string;workerId:string;user:string;status:string;startedAt:string;endedAt?:string;durationSeconds?:number};
export type PbsJob={id:string;kind:'sync'|'prune';store:string;schedule:string;enabled:boolean};
export type PbsHealthSnapshot={mode:'simulation'|'live';collectedAt:string;serverName:string;health:HealthStatus;datastores:PbsDatastore[];recentTasks:PbsTask[];jobs:PbsJob[];findings:PbsFinding[];collectionErrors:string[];summary:{datastores:number;snapshots:number;groups:number;unverified:number;verificationFailed:number;failedTasks24h:number;syncJobs:number;pruneJobs:number;storagePressure:number}};
export type PbsHealthResponse={status:{mode:'simulation'|'live';configured:boolean;intervalSeconds:number;retentionDays:number;snapshotWarningHours:number;snapshotCriticalHours:number;verificationWarningDays:number;gcWarningDays:number;storageWarningPercent:number;storageCriticalPercent:number;lastCollectedAt:string|null};current:PbsHealthSnapshot|null;history:PbsHealthSnapshot[]};

export type DockerContainer = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health: HealthStatus;
  composeProject?: string;
  composeService?: string;
  ports: Array<{ privatePort: number; publicPort?: number; protocol: string }>;
  createdAt: string;
};
export type DockerInventory = {
  source: 'simulation' | 'docker';
  collectedAt: string;
  engineName: string;
  engineVersion?: string;
  containers: DockerContainer[];
  summary: { total: number; running: number; stopped: number; healthy: number; unhealthy: number; composeProjects: number };
};
export type ConnectionStatus = { proxmox: { configured: boolean }; pbs:{configured:boolean}; docker: { configured: boolean }; redfish:{configured:boolean;targets:number}; snmp:{configured:boolean;targets:number};collectors:{configured:boolean;targets:number;online:number} };
export type HardwareComponent={id:string;name:string;type:string;health:HealthStatus;value?:number;unit?:string;detail?:string};
export type HardwareDevice={id:string;externalId:string;name:string;source:'redfish'|'snmp';category:'physical_server'|'switch'|'router'|'ups'|'pdu'|'storage_appliance'|'other';health:HealthStatus;status:string;manufacturer?:string;model?:string;serialNumber?:string;firmwareVersion?:string;managementAddress:string;metrics:Record<string,number|undefined>;components:HardwareComponent[];attributes:Record<string,string|number|boolean|null>;collectedAt:string};
export type HardwareInventory={mode:'simulation'|'live';collectedAt:string;devices:HardwareDevice[];summary:{devices:number;servers:number;networkDevices:number;powerDevices:number;healthy:number;warnings:number;critical:number;components:number}};
export type HardwareFinding={id:string;deviceId:string;deviceName:string;kind:string;severity:'warning'|'critical';title:string;detail:string;value?:number;unit?:string;status:'active'|'resolved';suppressed:boolean;firstSeenAt:string;lastSeenAt:string;resolvedAt?:string};
export type MaintenanceWindow={id:string;deviceId:string;reason:string;startsAt:string;endsAt:string;createdAt:string};
export type FirmwareBaseline={deviceId:string;firmwareVersion:string;model:string;serialNumber:string;recordedAt:string};
export type HardwareOperations={findings:HardwareFinding[];maintenanceWindows:MaintenanceWindow[];firmwareBaselines:FirmwareBaseline[];summary:{active:number;critical:number;warnings:number;suppressed:number;maintenance:number;baselines:number}};

export type MonitorProtocol = 'http' | 'tcp' | 'dns';
export type MonitorResult = { id: string; monitorId: string; status: 'up' | 'down'; latencyMs: number; detail: string; checkedAt: string };
export type Monitor = {
  id: string;
  name: string;
  protocol: MonitorProtocol;
  target: string;
  intervalSeconds: number;
  timeoutMs: number;
  enabled: boolean;
  expectedStatus?: number;
  createdAt: string;
  lastResult?: MonitorResult;
  healthScore: number | null;
  uptimePercent: number | null;
};
export type MonitorsResponse = { mode: 'simulation' | 'live'; monitors: Monitor[] };
export type AlertSeverity = 'warning' | 'critical';
export type AlertRule = { id: string; name: string; monitorId: string; failureThreshold: number; cooldownSeconds: number; severity: AlertSeverity; enabled: boolean; suppressedUntil?: string; createdAt: string };
export type Incident = { id: string; ruleId: string; monitorId: string; title: string; summary: string; severity: AlertSeverity; status: 'open' | 'acknowledged' | 'resolved'; occurrences: number; openedAt: string; updatedAt: string; acknowledgedAt?: string; resolvedAt?: string; lastNotificationAt?: string; externalTicket?:{provider:'servicenow';id:string;number:string;url?:string;updatedAt:string} };
export type NotificationStatus={mode:'simulation'|'live';webhookConfigured:boolean;slackConfigured:boolean;teamsConfigured:boolean;emailConfigured:boolean;serviceNowConfigured:boolean};
export type AlertsResponse = { rules: AlertRule[]; notifications: NotificationStatus };
export type NotificationDelivery={id:string;incidentId:string;channel:'webhook'|'slack'|'teams'|'email'|'servicenow'|'simulation';event:'opened'|'reminder'|'resolved';status:'sent'|'failed'|'simulated';detail:string;attempt:number;retryOf?:string;attemptedAt:string};
export type AutomationSnapshot={status:NotificationStatus;deliveries:NotificationDelivery[];summary:{sent:number;failed:number;simulated:number;tickets:number}};
export type ServiceNowOperation='INSERT'|'UPDATE'|'NO_CHANGE'|'ERROR'|'SIMULATED';
export type ServiceNowMapping={ciId:string;sysId?:string;className:string;operation:ServiceNowOperation;error?:string;syncedAt:string};
export type ServiceNowSyncRun={id:string;mode:'simulation'|'live';status:'completed'|'partial'|'failed';startedAt:string;finishedAt:string;items:number;relationships:number;inserted:number;updated:number;unchanged:number;failed:number;deferredRelationships:number};
export type ServiceNowChange={id:string;ciId:string;number:string;sysId?:string;status:'simulated'|'created'|'failed';shortDescription:string;startsAt:string;endsAt:string;createdAt:string;url?:string;error?:string};
export type ServiceNowCmdbSnapshot={status:{mode:'simulation'|'live';configured:boolean;source:string;feed:string;intervalMinutes:number;autoChanges:boolean;lastRun:ServiceNowSyncRun|null;mappings:number;changes:ServiceNowChange[]};mappings:ServiceNowMapping[];runs:ServiceNowSyncRun[];changes:ServiceNowChange[]};
export type TopologyNodeType = 'node' | 'vm' | 'lxc' | 'docker-host' | 'application' | 'container' | 'service';
export type TopologyNode = { id:string; type:TopologyNodeType; name:string; state:string; health:HealthStatus; source:'proxmox'|'docker'|'monitoring'; detail?:string };
export type TopologyEdge = { from:string; to:string; relation:'contains'|'hosts'|'runs'|'monitors'; inferred:boolean };
export type DependencyMapping = { id:string; monitorId:string; resourceId:string; createdAt:string };
export type CorrelationGroup = { id:string; rootNodeId:string; title:string; explanation:string; confidence:number; severity:AlertSeverity; incidentIds:string[]; affectedServices:string[]; evidence:string[] };
export type TopologySnapshot = { collectedAt:string; nodes:TopologyNode[]; edges:TopologyEdge[]; correlations:CorrelationGroup[]; mappings:DependencyMapping[]; summary:{nodes:number;relationships:number;services:number;unhealthyDependencies:number;correlatedGroups:number;unmappedServices:number} };
export type MetricRange='1h'|'6h'|'24h'|'7d'|'30d';
export type RetentionPolicy={days:number;maxResults:number};
export type MetricPoint={timestamp:string;checks:number;failures:number;availabilityPercent:number|null;avgLatencyMs:number|null};
export type MetricSummary={checks:number;failures:number;availabilityPercent:number|null;avgLatencyMs:number|null;p95LatencyMs:number|null};
export type MonitorMetricSeries={monitorId:string;name:string;protocol:MonitorProtocol;currentStatus:'up'|'down'|'pending';summary:MetricSummary;points:MetricPoint[]};
export type MetricsSnapshot={range:MetricRange;start:string;end:string;bucketSeconds:number;retainedResults:number;retention:RetentionPolicy;overall:MetricSummary&{activeIncidents:number;enabledRules:number};series:MonitorMetricSeries[]};

export type TelemetryPoint={timestamp:string;samples:number;cpuPercent:number|null;memoryPercent:number|null;diskPercent:number|null;networkRxBytesPerSecond:number|null;networkTxBytesPerSecond:number|null;diskReadBytesPerSecond:number|null;diskWriteBytesPerSecond:number|null};
export type TelemetrySample={id:string;resourceId:string;name:string;type:'node'|'vm'|'lxc'|'container';source:'proxmox'|'docker';state:string;cpuPercent:number;memoryPercent:number|null;diskPercent:number|null;networkRxBytesPerSecond:number|null;networkTxBytesPerSecond:number|null;diskReadBytesPerSecond:number|null;diskWriteBytesPerSecond:number|null;collectedAt:string};
export type TelemetrySeries={resourceId:string;name:string;type:TelemetrySample['type'];source:TelemetrySample['source'];state:string;latest:TelemetrySample;points:TelemetryPoint[]};
export type TelemetrySnapshot={range:MetricRange;start:string;end:string;bucketSeconds:number;summary:{resources:number;proxmoxResources:number;containers:number;warningResources:number;sampleCount:number};series:TelemetrySeries[]};

export type CiClass='node'|'vm'|'lxc'|'storage'|'docker_host'|'application'|'container'|'service'|'database'|'network'|'physical_server'|'switch'|'router'|'ups'|'pdu'|'storage_appliance'|'other';
export type CiLifecycle='active'|'stale'|'retired';
export type CiCriticality='low'|'medium'|'high'|'critical';
export type ConfigurationItem={id:string;externalId:string;class:CiClass;name:string;source:'proxmox'|'docker'|'monitoring'|'hardware'|'manual';lifecycle:CiLifecycle;status:string;environment:string;owner:string;criticality:CiCriticality;tags:string[];attributes:Record<string,string|number|boolean|null>;firstSeenAt:string;lastSeenAt:string;updatedAt:string;version:number};
export type CmdbRelationship={id:string;fromId:string;toId:string;type:'contains'|'hosts'|'runs_on'|'depends_on'|'monitored_by'|'connected_to';source:ConfigurationItem['source'];createdAt:string};
export type CmdbChange={id:string;ciId:string;action:string;fields:string[];actor:string;changedAt:string};
export type CmdbStatus={mode:'simulation'|'live';intervalSeconds:number;lastReconciledAt:string|null;lastError:string;items:number;relationships:number;stale:number};
export type CmdbSnapshot={status:CmdbStatus;items:ConfigurationItem[];relationships:CmdbRelationship[];changes:CmdbChange[]};
export type LogLevel='debug'|'info'|'warn'|'error'|'critical'|'unknown';
export type LogRange='15m'|'1h'|'6h'|'24h'|'7d';
export type LogEntry={id:string;timestamp:string;level:LogLevel;message:string;source:string;service:string;ciId:string;host:string;labels:Record<string,string>;raw:string};
export type LogSearchResult={mode:'simulation'|'live';query:string;range:LogRange;start:string;end:string;entries:LogEntry[];summary:{total:number;errors:number;warnings:number;sources:number;services:number}};
export type IncidentLogCorrelation=LogSearchResult&{incident:Incident;relatedConfigurationItems:string[]};
export type SentinelRole = 'viewer' | 'operator' | 'admin';
export interface Session { mode: 'disabled' | 'proxy'; user: { subject: string; name: string; email?: string; groups: string[]; role: SentinelRole; service?: boolean }; permissions: { operate: boolean; administer: boolean } }
export type SecurityEventType = 'session_authenticated' | 'authentication_failed' | 'authorization_denied';
export interface SecurityEvent { id:string;timestamp:string;type:SecurityEventType;severity:'info'|'warning';subject?:string;role?:SentinelRole;method:string;path:string;sourceIp?:string;reason?:string;requiredRole?:SentinelRole }
export interface SecuritySnapshot { events:SecurityEvent[];summary:{retained:number;failures:number;denied:number;sessions:number};retention:{days:number;maxEvents:number} }
export interface BackupSummary { id:string;createdAt:string;reason:'manual'|'scheduled';files:number;bytes:number;verified:boolean;replicated:boolean|null;replicaError?:string;error?:string }
export interface BackupSnapshot { enabled:boolean;intervalHours:number;maxBackups:number;replicaConfigured:boolean;replicaDirectory:string|null;lastError:string;backups:BackupSummary[];summary:{count:number;verified:number;replicated:number;latestAt:string|null} }
export type RecoveryDrillCheck={id:'manifest'|'restore-copy'|'checksums'|'sqlite'|'json'|'cleanup';name:string;status:'passed'|'failed';detail:string;durationMs:number};
export type RecoveryDrill={id:string;backupId:string;source:'primary'|'replica';trigger:'manual'|'scheduled';startedAt:string;finishedAt:string;durationMs:number;status:'passed'|'failed';checks:RecoveryDrillCheck[];files:number;bytes:number;error?:string};
export type RecoveryDrillSnapshot={status:{enabled:boolean;intervalDays:number;retentionDays:number;sourcePreference:'auto'|'primary'|'replica';replicaConfigured:boolean;workDirectory:string;lastError:string;lastRunAt:string|null;nextDueAt:string|null};runs:RecoveryDrill[];summary:{runs:number;passed:number;failed:number;consecutiveFailures:number;latestStatus:'passed'|'failed'|null;latestAt:string|null}};
export type GuestDrillStep={id:'preflight'|'archive'|'restore'|'isolate'|'boot'|'guest-agent'|'shutdown'|'destroy';name:string;status:'passed'|'failed'|'skipped';detail:string;durationMs:number};
export type GuestRecoveryDrill={id:string;mode:'simulation'|'live';sourceType:'qemu'|'lxc';sourceVmid:number;testVmid:number;archive:string;node:string;storage:string;startedAt:string;finishedAt:string;durationMs:number;status:'passed'|'failed';cleanupRequired:boolean;steps:GuestDrillStep[];error?:string};
export type GuestRecoverySnapshot={status:{mode:'simulation'|'live';liveRequested:boolean;configured:boolean;retentionDays:number;confirmationPhrase:string;node:string|null;backupStorage:string|null;targetStorage:string|null;sourceType:'qemu'|'lxc'|null;sourceVmid:number|null;vmidRange:string|null;bootSeconds:number|null;lastRunAt:string|null};runs:GuestRecoveryDrill[];summary:{runs:number;passed:number;failed:number;cleanupRequired:number;latestStatus:'passed'|'failed'|null;latestAt:string|null}};
export type RecoveryReadinessCheck={id:'backup-rpo'|'verification'|'replica'|'application-drill'|'guest-drill'|'pbs';name:string;status:'passed'|'warning'|'failed'|'skipped';required:boolean;weight:number;detail:string;observedAt:string|null};
export type RecoveryReadinessSnapshot={evaluatedAt:string;state:'ready'|'at-risk'|'not-ready';score:number;policy:{rpoHours:number;applicationDrillMaxAgeDays:number;guestDrillMaxAgeDays:number;requireReplica:boolean;requireGuestDrill:boolean;requirePbs:boolean};checks:RecoveryReadinessCheck[];summary:{passed:number;warning:number;failed:number;skipped:number;requiredFailures:number}};
export type CollectorKind='proxmox'|'docker'|'hybrid';
export type CollectorView={id:string;name:string;site:string;kind:CollectorKind;intervalSeconds:number;createdAt:string;lastSeenAt?:string;lastSequence?:number;status:'online'|'stale'|'never';ageSeconds:number|null;version:string|null;summary:{proxmoxResources:number;dockerContainers:number;warnings:number;errors:number}};
export type SiteView={name:string;collectors:number;online:number;stale:number;nodes:number;virtualMachines:number;lxcContainers:number;dockerContainers:number;warnings:number};
export type CollectorDashboardSnapshot={collectors:CollectorView[];sites:SiteView[];summary:{collectors:number;sites:number;online:number;stale:number;never:number;resources:number;warnings:number}};
