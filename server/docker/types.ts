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

