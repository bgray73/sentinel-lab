export type Kind = 'frontend' | 'api' | 'container' | 'livenx' | 'livewire';
export type Test = { id: string; name: string; kind: Kind; target: string; critical: boolean; timeoutMs: number };
export type Result = Test & { status: 'passed' | 'failed'; latency: number; detail: string; timestamp: string };
export type Run = { id: string; startedAt: string; duration: number; results: Result[] };

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
