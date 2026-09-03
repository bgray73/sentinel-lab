import { describe, expect, it } from 'vitest';
import { simulatedDockerInventory } from '../docker/inventory.js';
import { simulatedInventory } from '../proxmox/inventory.js';
import { buildTopology } from './engine.js';
import type { MonitorView } from '../monitoring/types.js';

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
});
