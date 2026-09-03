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
export type ConnectionStatus = { proxmox: { configured: boolean }; docker: { configured: boolean } };

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
export type Incident = { id: string; ruleId: string; monitorId: string; title: string; summary: string; severity: AlertSeverity; status: 'open' | 'acknowledged' | 'resolved'; occurrences: number; openedAt: string; updatedAt: string; acknowledgedAt?: string; resolvedAt?: string; lastNotificationAt?: string };
export type AlertsResponse = { rules: AlertRule[]; notifications: { mode: 'simulation' | 'live'; webhookConfigured: boolean; emailConfigured: boolean } };
export type TopologyNodeType = 'node' | 'vm' | 'lxc' | 'docker-host' | 'application' | 'container' | 'service';
export type TopologyNode = { id:string; type:TopologyNodeType; name:string; state:string; health:HealthStatus; source:'proxmox'|'docker'|'monitoring'; detail?:string };
export type TopologyEdge = { from:string; to:string; relation:'contains'|'hosts'|'runs'|'monitors'; inferred:boolean };
export type DependencyMapping = { id:string; monitorId:string; resourceId:string; createdAt:string };
export type CorrelationGroup = { id:string; rootNodeId:string; title:string; explanation:string; confidence:number; severity:AlertSeverity; incidentIds:string[]; affectedServices:string[]; evidence:string[] };
export type TopologySnapshot = { collectedAt:string; nodes:TopologyNode[]; edges:TopologyEdge[]; correlations:CorrelationGroup[]; mappings:DependencyMapping[]; summary:{nodes:number;relationships:number;services:number;unhealthyDependencies:number;correlatedGroups:number;unmappedServices:number} };
