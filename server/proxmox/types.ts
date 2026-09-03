export type ProxmoxResourceType = 'node' | 'qemu' | 'lxc' | 'storage';
export type HealthStatus = 'healthy' | 'warning' | 'critical' | 'unknown';

export type ProxmoxResource = {
  id: string;
  type: ProxmoxResourceType;
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

export type ProxmoxApiResource = {
  id: string;
  type: string;
  name?: string;
  node?: string;
  vmid?: number;
  status?: string;
  uptime?: number;
  cpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
};

