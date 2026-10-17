import { describe, expect, it } from 'vitest';
import { buildUnifiedInventory } from './inventory.js';
import type { ProxmoxInventory } from '../proxmox/types.js';
import type { DockerInventory } from '../docker/types.js';

describe('unified workload inventory', () => {
  it('combines VMs, LXC and Docker without including nodes or storage', () => {
    const proxmox = {
      source: 'simulation', collectedAt: '', clusterName: 'lab',
      resources: [
        { id: 'node/pve01', type: 'node', name: 'pve01', state: 'online', health: 'healthy' },
        { id: 'qemu/101', type: 'qemu', name: 'ai-vm', node: 'pve01', state: 'running', health: 'healthy' },
        { id: 'lxc/102', type: 'lxc', name: 'dns', node: 'pve02', state: 'stopped', health: 'warning' }
      ], summary: { nodes: 1, virtualMachines: 1, lxcContainers: 1, storagePools: 0, runningWorkloads: 1, stoppedWorkloads: 1, warnings: 1 }
    } as ProxmoxInventory;
    const docker = {
      source: 'docker', collectedAt: '', engineName: 'docker01',
      containers: [{ id: 'abc', name: 'ollama', image: 'ollama/ollama', state: 'running', status: 'Up', health: 'critical', ports: [], createdAt: '' }],
      summary: { total: 1, running: 1, stopped: 0, healthy: 0, unhealthy: 1, composeProjects: 0 }
    } as DockerInventory;
    const result = buildUnifiedInventory(proxmox, docker);
    expect(result.workloads.map(w => w.kind).sort()).toEqual(['docker', 'lxc', 'vm']);
    expect(result.summary).toMatchObject({ total: 3, running: 2, stopped: 1, unhealthy: 1, simulated: 2 });
    expect(result.workloads.find(w => w.name === 'ollama')?.host).toBe('docker01');
  });

  it('returns empty inventory when sources are unavailable', () => {
    expect(buildUnifiedInventory(null, null).summary.total).toBe(0);
  });
});
