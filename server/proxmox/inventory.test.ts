import { describe, expect, it, vi } from 'vitest';
import { configFromEnvironment, discoverProxmox } from './client.js';
import { buildInventory, simulatedInventory } from './inventory.js';

describe('Proxmox inventory', () => {
  it('builds a hierarchy and summary from cluster resources', () => {
    const inventory = buildInventory([
      { id: 'node/pve-01', type: 'node', name: 'pve-01', status: 'online' },
      { id: 'qemu/100', type: 'qemu', vmid: 100, name: 'app', node: 'pve-01', status: 'running' },
      { id: 'lxc/200', type: 'lxc', vmid: 200, name: 'dns', node: 'pve-01', status: 'stopped' },
      { id: 'storage/zfs', type: 'storage', name: 'zfs', node: 'pve-01', status: 'available', disk: 91, maxdisk: 100 }
    ], 'proxmox', 'lab');

    expect(inventory.summary).toMatchObject({ nodes: 1, virtualMachines: 1, lxcContainers: 1, runningWorkloads: 1, stoppedWorkloads: 1, warnings: 1 });
    expect(inventory.resources.find(item => item.id === 'qemu/100')?.parentId).toBe('node/pve-01');
    expect(inventory.resources.find(item => item.id === 'storage/zfs')?.health).toBe('critical');
  });

  it('provides a safe simulated inventory without credentials', () => {
    const inventory = simulatedInventory();
    expect(inventory.source).toBe('simulation');
    expect(inventory.summary.nodes).toBe(3);
    expect(inventory.resources.length).toBeGreaterThan(3);
  });

  it('requires HTTPS by default', () => {
    expect(() => configFromEnvironment({ PVE_URL: 'http://pve.local:8006', PVE_TOKEN_ID: 'a', PVE_TOKEN_SECRET: 'b' })).toThrow('must use HTTPS');
  });

  it('sends the Proxmox token and normalizes the API response', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'node/pve-01', type: 'node', name: 'pve-01', status: 'online' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ type: 'cluster', name: 'my-lab' }] }), { status: 200 }));
    const inventory = await discoverProxmox({ baseUrl: 'https://pve.local:8006', tokenId: 'sentinel@pve!monitor', tokenSecret: 'secret' }, fetcher);
    expect(inventory.clusterName).toBe('my-lab');
    expect(fetcher.mock.calls[0][1].headers.Authorization).toBe('PVEAPIToken=sentinel@pve!monitor=secret');
  });
});

