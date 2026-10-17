import type { ProxmoxInventory } from '../proxmox/types.js';
import type { DockerInventory } from '../docker/types.js';

export type UnifiedWorkload = {
  id: string;
  provider: 'proxmox' | 'docker';
  kind: 'vm' | 'lxc' | 'docker';
  name: string;
  host: string;
  state: string;
  health: 'healthy' | 'warning' | 'critical' | 'unknown';
  simulated: boolean;
  cpuPercent?: number;
  memoryUsedBytes?: number;
  memoryTotalBytes?: number;
  image?: string;
  composeProject?: string;
};

export type UnifiedInventory = {
  collectedAt: string;
  workloads: UnifiedWorkload[];
  summary: { total: number; running: number; stopped: number; unhealthy: number; simulated: number };
};

export function buildUnifiedInventory(proxmox: ProxmoxInventory | null, docker: DockerInventory | null): UnifiedInventory {
  const workloads: UnifiedWorkload[] = [];
  for (const resource of proxmox?.resources ?? []) {
    if (resource.type !== 'qemu' && resource.type !== 'lxc') continue;
    workloads.push({
      id: `proxmox:${resource.id}`, provider: 'proxmox',
      kind: resource.type === 'qemu' ? 'vm' : 'lxc',
      name: resource.name, host: resource.node ?? 'unknown',
      state: resource.state, health: resource.health,
      simulated: proxmox?.source === 'simulation',
      cpuPercent: resource.cpuPercent, memoryUsedBytes: resource.memoryUsedBytes,
      memoryTotalBytes: resource.memoryTotalBytes
    });
  }
  for (const container of docker?.containers ?? []) {
    workloads.push({
      id: `docker:${docker?.engineName ?? 'unknown'}:${container.id}`,
      provider: 'docker', kind: 'docker', name: container.name,
      host: docker?.engineName ?? 'unknown', state: container.state,
      health: container.health, simulated: docker?.source === 'simulation',
      image: container.image, composeProject: container.composeProject
    });
  }
  workloads.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return {
    collectedAt: new Date().toISOString(), workloads,
    summary: {
      total: workloads.length,
      running: workloads.filter(w => w.state.toLowerCase() === 'running').length,
      stopped: workloads.filter(w => w.state.toLowerCase() !== 'running').length,
      unhealthy: workloads.filter(w => w.health === 'critical').length,
      simulated: workloads.filter(w => w.simulated).length
    }
  };
}
