import type { CmdbRelationship, ConfigurationItem } from '../cmdb/types.js';
import type { TopologyEdge, TopologyHealth, TopologyNode } from './types.js';

export function networkTopology(items: ConfigurationItem[], relationships: CmdbRelationship[]) {
  const active = items.filter(item => item.lifecycle === 'active');
  const byId = new Map(active.map(item => [item.id, item]));
  const networkRelations = relationships.filter(relation =>
    (relation.source === 'network' || relation.source === 'manual') &&
    ['contains', 'connected_to'].includes(relation.type) &&
    byId.has(relation.fromId) && byId.has(relation.toId) &&
    (byId.get(relation.fromId)?.class === 'network_interface' || byId.get(relation.toId)?.class === 'network_interface'));
  const included = new Set(networkRelations.flatMap(relation => [relation.fromId, relation.toId]));
  const nodes: TopologyNode[] = [];
  for (const item of active.filter(value => included.has(value.id) && ['switch', 'router', 'storage_appliance', 'network_interface'].includes(value.class))) {
    const health = String(item.attributes.health || 'unknown');
    nodes.push({ id: item.externalId, type: item.class === 'network_interface' ? 'network-interface' : item.class === 'storage_appliance' ? 'storage-appliance' : item.class as 'switch' | 'router', name: item.name, state: item.status, health: (['healthy', 'warning', 'critical'].includes(health) ? health : 'unknown') as TopologyHealth, source: item.source === 'network' ? 'network' : 'hardware', detail: item.class === 'network_interface' ? String(item.attributes.alias || '') : String(item.attributes.managementAddress || '') });
  }
  const visible = new Set(nodes.map(node => node.id));
  const edges: TopologyEdge[] = networkRelations.flatMap(relation => {
    const from = byId.get(relation.fromId)!, to = byId.get(relation.toId)!;
    if (!visible.has(from.externalId) || !visible.has(to.externalId) && to.class !== 'node') return [];
    return [{ from: from.externalId, to: to.externalId, relation: relation.type as 'contains' | 'connected_to', inferred: relation.source === 'network' }];
  });
  return { nodes, edges };
}
