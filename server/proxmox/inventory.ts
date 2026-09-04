import type { HealthStatus, ProxmoxApiResource, ProxmoxInventory, ProxmoxResource, ProxmoxResourceType } from './types.js';

const supportedTypes = new Set<ProxmoxResourceType>(['node', 'qemu', 'lxc', 'storage']);

function percent(value?: number, total?: number) {
  if (value === undefined || !total) return undefined;
  return Math.round((value / total) * 10_000) / 100;
}

function healthFor(resource: ProxmoxApiResource): HealthStatus {
  if (resource.type === 'node') return resource.status === 'online' ? 'healthy' : 'critical';
  if (resource.type === 'qemu' || resource.type === 'lxc') return resource.status === 'running' ? 'healthy' : 'unknown';
  const diskUse = percent(resource.disk, resource.maxdisk);
  if (diskUse !== undefined && diskUse >= 90) return 'critical';
  if (diskUse !== undefined && diskUse >= 80) return 'warning';
  return 'healthy';
}

function normalizeResource(resource: ProxmoxApiResource): ProxmoxResource | null {
  if (!supportedTypes.has(resource.type as ProxmoxResourceType)) return null;
  const type = resource.type as ProxmoxResourceType;
  const node = resource.node || (type === 'node' ? resource.name || resource.id.replace('node/', '') : undefined);

  return {
    id: resource.id,
    type,
    name: resource.name || (resource.vmid ? `${type}-${resource.vmid}` : resource.id),
    node,
    vmid: resource.vmid,
    parentId: type === 'qemu' || type === 'lxc' ? (node ? `node/${node}` : undefined) : undefined,
    state: resource.status || 'unknown',
    health: healthFor(resource),
    uptimeSeconds: resource.uptime,
    cpuPercent: resource.cpu === undefined ? undefined : Math.round(resource.cpu * 10_000) / 100,
    memoryUsedBytes: resource.mem,
    memoryTotalBytes: resource.maxmem,
    diskUsedBytes: resource.disk,
    diskTotalBytes: resource.maxdisk,
    networkRxBytes: resource.netin,
    networkTxBytes: resource.netout
  };
}

export function buildInventory(resources: ProxmoxApiResource[], source: ProxmoxInventory['source'], clusterName = 'Proxmox cluster'): ProxmoxInventory {
  const normalized = resources.map(normalizeResource).filter((item): item is ProxmoxResource => item !== null);
  const workloads = normalized.filter(item => item.type === 'qemu' || item.type === 'lxc');

  return {
    source,
    collectedAt: new Date().toISOString(),
    clusterName,
    resources: normalized,
    summary: {
      nodes: normalized.filter(item => item.type === 'node').length,
      virtualMachines: normalized.filter(item => item.type === 'qemu').length,
      lxcContainers: normalized.filter(item => item.type === 'lxc').length,
      storagePools: normalized.filter(item => item.type === 'storage').length,
      runningWorkloads: workloads.filter(item => item.state === 'running').length,
      stoppedWorkloads: workloads.filter(item => item.state !== 'running').length,
      warnings: normalized.filter(item => item.health === 'warning' || item.health === 'critical').length
    }
  };
}

export function simulatedInventory() {
  return buildInventory([
    { id: 'node/pve-01', type: 'node', name: 'pve-01', status: 'online', cpu: 0.34, mem: 41_876_701_184, maxmem: 68_719_476_736, uptime: 1_432_110 },
    { id: 'node/pve-02', type: 'node', name: 'pve-02', status: 'online', cpu: 0.47, mem: 57_037_165_568, maxmem: 68_719_476_736, uptime: 982_440 },
    { id: 'node/pve-03', type: 'node', name: 'pve-03', status: 'online', cpu: 0.21, mem: 32_985_348_096, maxmem: 68_719_476_736, uptime: 2_118_003 },
    { id: 'qemu/104', type: 'qemu', vmid: 104, name: 'docker-01', node: 'pve-02', status: 'running', cpu: 0.41, mem: 6_979_321_856, maxmem: 8_589_934_592, uptime: 381_200, netin: 8_200_000_000, netout: 3_100_000_000 },
    { id: 'qemu/108', type: 'qemu', vmid: 108, name: 'monitoring', node: 'pve-01', status: 'running', cpu: 0.18, mem: 4_294_967_296, maxmem: 8_589_934_592, uptime: 741_320, netin: 4_500_000_000, netout: 2_700_000_000 },
    { id: 'lxc/201', type: 'lxc', vmid: 201, name: 'home-assistant', node: 'pve-03', status: 'running', cpu: 0.09, mem: 1_610_612_736, maxmem: 4_294_967_296, uptime: 1_201_100, netin: 1_900_000_000, netout: 980_000_000 },
    { id: 'lxc/202', type: 'lxc', vmid: 202, name: 'lab-dns', node: 'pve-01', status: 'stopped' },
    { id: 'storage/local-zfs', type: 'storage', name: 'local-zfs', node: 'pve-02', status: 'available', disk: 8_900_000_000_000, maxdisk: 10_000_000_000_000 }
  ], 'simulation', 'Sentinel homelab');
}
