import { describe, expect, it } from 'vitest';
import { simulatedDockerInventory } from '../docker/inventory.js';
import { simulatedInventory } from '../proxmox/inventory.js';
import { buildTopology } from './engine.js';
import type { MonitorView } from '../monitoring/types.js';
import type { ConfigurationItem, CmdbRelationship } from '../cmdb/types.js';
import { networkInterfaceIncidentKey } from '../network/identity.js';

const stamp = new Date().toISOString();
function networkGraph(portHealth: 'healthy' | 'critical' = 'healthy') {
  const make = (id: string, externalId: string, className: ConfigurationItem['class'], name: string, attributes: ConfigurationItem['attributes'] = {}): ConfigurationItem => ({
    id, externalId, class: className, name, source: 'network', lifecycle: 'active', status: 'up', environment: 'lab', owner: '', criticality: 'medium', tags: [], attributes, firstSeenAt: stamp, lastSeenAt: stamp, updatedAt: stamp, version: 1,
  });
  const items = [make('switch', 'hardware/nexus-core-01', 'switch', 'Core switch'), make('port', 'interface/nexus-core-01/1', 'network_interface', 'Ethernet1/1', { deviceId: 'nexus-core-01', ifIndex: '1', health: portHealth, alias: 'pve-01 uplink' }), make('node', 'node/pve-01', 'node', 'pve-01')];
  const relationship = (id: string, fromId: string, toId: string, type: CmdbRelationship['type']): CmdbRelationship => ({ id, fromId, toId, type, source: 'network', createdAt: stamp });
  return { items, relationships: [relationship('r1','switch','port','contains'),relationship('r2','port','node','connected_to')] };
}
function portIncident() {
  const key = networkInterfaceIncidentKey('nexus-core-01','1');
  return { id: 'port-alert', ruleId: `system-${key}`, monitorId: `system/${key}`, title: 'Port down', summary: 'Operational state is down', severity: 'critical' as const, status: 'open' as const, occurrences: 1, openedAt: stamp, updatedAt: stamp };
}

const monitors: MonitorView[] = [
  { id:'monitor-dns',name:'Lab DNS resolution',protocol:'dns',target:'lab-dns',intervalSeconds:60,timeoutMs:3000,enabled:true,createdAt:new Date().toISOString(),healthScore:20,uptimePercent:50,lastResult:{id:'r1',monitorId:'monitor-dns',status:'down',latencyMs:3,detail:'failed',checkedAt:new Date().toISOString()} }
];

describe('dependency topology and correlation',()=>{
  it('links services to discovered resources and explains an unhealthy root cause',()=>{
    const snapshot=buildTopology(simulatedInventory(),simulatedDockerInventory(),monitors,{mappings:[],incidents:[{id:'i1',ruleId:'a1',monitorId:'monitor-dns',title:'DNS down',summary:'failed',severity:'critical',status:'open',occurrences:2,openedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]});
    expect(snapshot.edges).toContainEqual(expect.objectContaining({from:'lxc/202',to:'service/monitor-dns',inferred:true}));
    expect(snapshot.correlations[0]).toMatchObject({rootNodeId:'lxc/202',confidence:72,severity:'critical'});
    expect(snapshot.summary.unhealthyDependencies).toBeGreaterThan(0);
  });
  it('prefers an explicit mapping over inferred relationships',()=>{
    const snapshot=buildTopology(simulatedInventory(),simulatedDockerInventory(),monitors,{incidents:[],mappings:[{id:'m1',monitorId:'monitor-dns',resourceId:'qemu/108',createdAt:new Date().toISOString()}]});
    expect(snapshot.edges).toContainEqual({from:'qemu/108',to:'service/monitor-dns',relation:'monitors',inferred:false});
    expect(snapshot.edges.some(edge=>edge.to==='service/monitor-dns'&&edge.inferred)).toBe(false);
  });
  it('ignores system incidents that do not represent a service node',()=>{
    const snapshot=buildTopology(simulatedInventory(),simulatedDockerInventory(),monitors,{mappings:[],incidents:[{id:'i-system',ruleId:'system-recovery-readiness',monitorId:'system/recovery-readiness',title:'Disaster recovery is not ready',summary:'failed',severity:'critical',status:'open',occurrences:1,openedAt:new Date().toISOString(),updatedAt:new Date().toISOString()}]});
    expect(snapshot.correlations).toEqual([]);
  });
  it('correlates an exact network alert to its port and potentially affected Proxmox path even with stale CMDB health',()=>{
    const snapshot=buildTopology(simulatedInventory(),simulatedDockerInventory(),monitors,{mappings:[{id:'m1',monitorId:'monitor-dns',resourceId:'node/pve-01',createdAt:stamp}],incidents:[portIncident()]},networkGraph());
    expect(snapshot.correlations).toHaveLength(1);
    expect(snapshot.correlations[0]).toMatchObject({rootNodeId:'interface/nexus-core-01/1',incidentIds:['port-alert'],severity:'critical'});
    expect(snapshot.correlations[0].affectedServices).toContain('pve-01');
    expect(snapshot.correlations[0].affectedServices).toContain('Lab DNS resolution');
    expect(snapshot.correlations[0].explanation).toContain('may be affected');
    expect(snapshot.correlations[0].evidence).toContain('Operational state is down');
  });
  it('groups a downstream service alert with its active network port alert',()=>{
    const serviceIncident={...portIncident(),id:'dns-alert',ruleId:'dns-rule',monitorId:'monitor-dns'};
    const snapshot=buildTopology(simulatedInventory(),simulatedDockerInventory(),monitors,{mappings:[{id:'m1',monitorId:'monitor-dns',resourceId:'node/pve-01',createdAt:stamp}],incidents:[portIncident(),serviceIncident]},networkGraph());
    expect(snapshot.correlations).toHaveLength(1);
    expect(snapshot.correlations[0].incidentIds).toEqual(expect.arrayContaining(['port-alert','dns-alert']));
  });
  it('does not attach unmatched, resolved, or disconnected network alerts to the graph',()=>{
    const graph=networkGraph('critical');
    const unmatched={...portIncident(),ruleId:`system-${networkInterfaceIncidentKey('other-device','1')}`,monitorId:`system/${networkInterfaceIncidentKey('other-device','1')}`};
    const snapshot=buildTopology(simulatedInventory(),simulatedDockerInventory(),monitors,{mappings:[],incidents:[unmatched,{...portIncident(),id:'resolved',status:'resolved'}]},graph);
    expect(snapshot.correlations).toEqual([]);
    expect(buildTopology(simulatedInventory(),simulatedDockerInventory(),monitors,{mappings:[],incidents:[portIncident()]},{items:graph.items,relationships:[]} ).correlations).toEqual([]);
  });
});
