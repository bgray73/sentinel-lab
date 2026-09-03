import { describe, expect, it } from 'vitest';
import { formatBytes, groupInventory, percent } from './inventory';
import type { ProxmoxInventory } from './types';

const inventory: ProxmoxInventory = {
  source: 'simulation', collectedAt: '2026-01-01T00:00:00Z', clusterName: 'lab',
  summary: { nodes: 1, virtualMachines: 1, lxcContainers: 0, storagePools: 1, runningWorkloads: 1, stoppedWorkloads: 0, warnings: 0 },
  resources: [
    { id: 'node/pve-01', type: 'node', name: 'pve-01', state: 'online', health: 'healthy' },
    { id: 'qemu/100', type: 'qemu', name: 'app', node: 'pve-01', parentId: 'node/pve-01', state: 'running', health: 'healthy' },
    { id: 'storage/zfs', type: 'storage', name: 'zfs', node: 'pve-01', state: 'available', health: 'healthy' }
  ]
};

describe('inventory helpers', () => {
  it('groups workloads and storage under their Proxmox node', () => {
    const groups = groupInventory(inventory);
    expect(groups).toHaveLength(1);
    expect(groups[0].workloads[0].name).toBe('app');
    expect(groups[0].storage[0].name).toBe('zfs');
  });

  it('formats utilization and byte values', () => {
    expect(percent(75, 100)).toBe(75);
    expect(percent(undefined, 100)).toBeNull();
    expect(formatBytes(1_073_741_824)).toBe('1.0 GB');
  });
});
