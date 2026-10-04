import { describe, expect, it, vi } from 'vitest';
import { dependencyEvidence, type DependencyContext } from './jev-evidence.js';
import { JevService } from './jev.js';
import type { ConfigurationItem } from '../cmdb/types.js';
import type { Incident } from '../monitoring/types.js';

const now=Date.now();
const incident={id:'private',monitorId:'private-monitor',ruleId:'rule',status:'open',severity:'warning'} as Incident;
const item=(id:string,type:ConfigurationItem['class']='vm'):ConfigurationItem=>({id,externalId:id,name:'secret.example',class:type,source:'proxmox',status:'running',lifecycle:'active',attributes:{health:'private token',password:'secret'},environment:'private',owner:'private',criticality:'high',tags:[],firstSeenAt:'',lastSeenAt:'',updatedAt:'',version:1});
function context():DependencyContext{return {mode:'live',monitorMode:'live',collectedAt:new Date(now).toISOString(),items:[item('vm'),{...item('host','node'),status:'offline'},item('unrelated')],mappings:[{id:'mapping',monitorId:incident.monitorId,resourceId:'vm',createdAt:''}],relationships:[{id:'edge',fromId:'host',toId:'vm',type:'hosts',source:'proxmox',createdAt:''}]};}
describe('Jev dependency evidence',()=>{
  it('includes only mapped resources and ancestors, preserving unknown health',()=>{
    const result=dependencyEvidence(incident,context(),now);
    expect(result.resources).toEqual([{type:'node',healthy:0,warning:0,critical:1,unknown:0},{type:'vm',healthy:0,warning:0,critical:0,unknown:1}]);
    expect(JSON.stringify(result)).not.toMatch(/secret|private|password|unrelated/);
  });
  it('rejects stale, future, failed and mixed-mode evidence',()=>{
    for(const patch of [{collectedAt:new Date(now-600001).toISOString()},{collectedAt:new Date(now+1).toISOString()},{collectedAt:null},{error:'secret error'}])expect(dependencyEvidence(incident,{...context(),...patch},now).availability).toBe('stale_or_failed');
    expect(dependencyEvidence(incident,{...context(),mode:'simulation'},now).availability).toBe('mode_mismatch');
  });
  it('omits retired resources and terminates cycles without duplicates',()=>{
    const c=context();c.items[0].lifecycle='retired';expect(dependencyEvidence(incident,c,now).availability).toBe('unmapped');
    c.items[0].lifecycle='active';c.relationships.push({...c.relationships[0],id:'cycle',fromId:'vm',toId:'host'});
    expect(dependencyEvidence(incident,c,now).resources).toHaveLength(2);
  });
  it('does not let a healthy attribute override an offline state',()=>{
    const c=context();c.items[1].attributes.health='healthy';
    expect(dependencyEvidence(incident,c,now).resources.find(item=>item.type==='node')?.critical).toBe(1);
  });
  it('caps resources and reports truncation',()=>{
    const c=context();c.items=Array.from({length:110},(_,i)=>item(String(i)));c.mappings=c.items.map(ci=>({id:ci.id,monitorId:incident.monitorId,resourceId:ci.id,createdAt:''}));
    expect(dependencyEvidence(incident,c,now)).toMatchObject({truncated:true,resources:[{type:'vm',unknown:100}]});
  });
  it('keeps extended evidence opt-in and transmits only sanitized aggregates',async()=>{
    const reply=()=>new Response(JSON.stringify({answers:{category:{type:'choice',choice:'insufficient_evidence',confidence:0.8}}}));
    for(const enabled of [false,true]){
      const fetcher=vi.fn().mockImplementation(async()=>reply());
      const service=new JevService({SENTINEL_REAL_JEV:'true',TYPESAFE_API_KEY:'test',SENTINEL_JEV_DEPENDENCIES:String(enabled)},fetcher);
      await service.analyze(incident,undefined,context());
      const state=JSON.parse(JSON.parse(fetcher.mock.calls[0][1].body).state);
      expect(!!state.dependencies).toBe(enabled);
      expect(JSON.stringify(state)).not.toMatch(/private|secret|password/);
    }
  });
});
