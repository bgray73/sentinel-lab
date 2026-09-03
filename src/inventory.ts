import type { ProxmoxInventory, ProxmoxResource } from './types';

export type NodeGroup = { node: ProxmoxResource; workloads: ProxmoxResource[]; storage: ProxmoxResource[] };

export function groupInventory(inventory: ProxmoxInventory): NodeGroup[] {
  const nodes = inventory.resources.filter(resource => resource.type === 'node');
  return nodes.map(node => ({
    node,
    workloads: inventory.resources.filter(resource => resource.parentId === node.id),
    storage: inventory.resources.filter(resource => resource.type === 'storage' && resource.node === node.name)
  }));
}

export function percent(used?: number, total?: number) {
  if (used === undefined || !total) return null;
  return Math.round((used / total) * 100);
}

export function formatBytes(value?: number) {
  if (value === undefined) return '—';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let current = value;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) { current /= 1024; unit += 1; }
  return `${current >= 10 || unit === 0 ? current.toFixed(0) : current.toFixed(1)} ${units[unit]}`;
}

