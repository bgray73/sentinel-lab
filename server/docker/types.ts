export type DockerHealth = 'healthy' | 'warning' | 'critical' | 'unknown';

export type DockerContainer = {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  health: DockerHealth;
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
  summary: {
    total: number;
    running: number;
    stopped: number;
    healthy: number;
    unhealthy: number;
    composeProjects: number;
  };
};

export type DockerApiContainer = {
  Id: string;
  Names?: string[];
  Image: string;
  State: string;
  Status: string;
  Created: number;
  Labels?: Record<string, string>;
  Ports?: Array<{ PrivatePort: number; PublicPort?: number; Type: string }>;
};

export type DockerApiStats = {
  cpu_stats?: { cpu_usage?: { total_usage?: number; percpu_usage?: number[] }; system_cpu_usage?: number; online_cpus?: number };
  precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number };
  memory_stats?: { usage?: number; limit?: number; stats?: { cache?: number } };
  networks?: Record<string,{ rx_bytes?:number; tx_bytes?:number }>;
  blkio_stats?: { io_service_bytes_recursive?: Array<{ op?:string; value?:number }> };
};

export type DockerResourceStats = { containerId:string; cpuPercent:number; memoryUsedBytes:number; memoryLimitBytes:number; networkRxBytes:number; networkTxBytes:number; diskReadBytes:number; diskWriteBytes:number };
