import type { CmdbRelationship, ConfigurationItem } from '../cmdb/types.js';
import type { DependencyMapping, Incident } from '../monitoring/types.js';

export type DependencyContext = { items: ConfigurationItem[]; relationships: CmdbRelationship[]; mappings: DependencyMapping[]; mode: string; monitorMode: string; collectedAt: string | null; error?: string };
const classes = ['node','vm','lxc','storage','docker_host','application','container','service','database','network','network_interface','physical_server','switch','router','ups','pdu','storage_appliance','other'] as const;

export function dependencyEvidence(incident: Incident, context?: DependencyContext, now = Date.now()) {
  const empty = (availability: string) => ({ availability, truncated: false, resources: [] as { type: string; healthy: number; warning: number; critical: number; unknown: number }[] });
  if (!context) return empty('unavailable');
  if (!['live','simulation'].includes(context.mode) || context.mode !== context.monitorMode) return empty('mode_mismatch');
  const age = now - Date.parse(context.collectedAt || '');
  if (!Number.isFinite(age) || age < 0 || age > 600_000 || context.error) return empty('stale_or_failed');
  const active = context.items.filter(item=>item.lifecycle==='active');
  const nodes = new Map(active.map(item=>[item.id,item]));
  const resources = new Set(context.mappings.filter(mapping=>mapping.monitorId===incident.monitorId).map(mapping=>mapping.resourceId));
  const queue = active.filter(item=>resources.has(item.externalId)).map(item=>item.id).sort();
  if (!queue.length) return empty('unmapped');
  const parents = new Map<string,string[]>();
  for (const edge of context.relationships) {
    if (!nodes.has(edge.fromId) || !nodes.has(edge.toId)) continue;
    // Follow only unambiguous parent-to-child discovery relationships.
    // Manual runs_on semantics can differ, so omit those links.
    const reverse = ['hosts','contains'].includes(edge.type) || edge.type==='connected_to' && nodes.get(edge.fromId)?.class==='network_interface' || edge.type==='runs_on' && edge.source==='docker';
    if (!reverse) continue;
    parents.set(edge.toId,[...(parents.get(edge.toId)||[]),edge.fromId]);
  }
  const seen = new Set<string>();
  const groups = new Map<string,{type:string;healthy:number;warning:number;critical:number;unknown:number}>();
  for (let index=0;index<queue.length && seen.size<100;index++) {
    const id=queue[index]; if(seen.has(id))continue; seen.add(id);
    const item=nodes.get(id)!;
    const type=classes.includes(item.class)?item.class:'other';
    const group=groups.get(type)||{type,healthy:0,warning:0,critical:0,unknown:0};
    const value=item.attributes.health;
    const health=['stopped','dead','exited','offline','down'].includes(item.status)?'critical':value==='healthy'||value==='warning'||value==='critical'?value:'unknown';
    group[health]++;groups.set(type,group);
    for(const parent of (parents.get(id)||[]).sort())if(!seen.has(parent))queue.push(parent);
  }
  return {availability:'included',truncated:queue.some(id=>!seen.has(id)),resources:[...groups.values()].sort((a,b)=>a.type.localeCompare(b.type))};
}
