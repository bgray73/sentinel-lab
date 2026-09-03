import type { MonitorView } from '../monitoring/types.js';
import type { DockerInventory } from '../docker/types.js';
import type { ProxmoxInventory } from '../proxmox/types.js';
import type { CorrelationGroup, CorrelationInput, TopologyEdge, TopologyHealth, TopologyNode, TopologySnapshot } from './types.js';

function workloadHealth(state: string, health: TopologyHealth): TopologyHealth { return ['stopped','dead','exited','offline'].includes(state.toLowerCase()) ? 'critical' : health; }
function words(value: string) { return value.toLowerCase().split(/[^a-z0-9]+/).filter(word => word.length > 2); }
function matchScore(monitor: MonitorView, node: TopologyNode) {
  const monitorWords = new Set(words(`${monitor.name} ${monitor.target}`));
  return words(`${node.name} ${node.detail || ''}`).reduce((score, word) => score + (monitorWords.has(word) ? 1 : 0), 0);
}

export function buildTopology(proxmox: ProxmoxInventory, docker: DockerInventory, monitors: MonitorView[], input: CorrelationInput): TopologySnapshot {
  const nodes: TopologyNode[] = []; const edges: TopologyEdge[] = [];
  for (const resource of proxmox.resources) {
    if (resource.type === 'storage') continue;
    nodes.push({ id: resource.id, type: resource.type === 'qemu' ? 'vm' : resource.type, name: resource.name, state: resource.state, health: workloadHealth(resource.state, resource.health), source: 'proxmox', detail: resource.vmid ? `VMID ${resource.vmid}` : resource.node });
    if (resource.parentId) edges.push({ from: resource.parentId, to: resource.id, relation: 'hosts', inferred: false });
  }
  const dockerHost: TopologyNode = { id: `docker-host/${docker.engineName}`, type: 'docker-host', name: docker.engineName, state: 'connected', health: docker.summary.unhealthy ? 'warning' : 'healthy', source: 'docker', detail: docker.engineVersion };
  nodes.push(dockerHost);
  const matchingWorkload = nodes.filter(node => node.type === 'vm' || node.type === 'lxc').sort((a,b)=>matchScore({ name: docker.engineName, target: docker.engineName } as MonitorView,b)-matchScore({ name: docker.engineName, target: docker.engineName } as MonitorView,a))[0];
  if (matchingWorkload && matchScore({ name: docker.engineName, target: docker.engineName } as MonitorView, matchingWorkload)) edges.push({ from: matchingWorkload.id, to: dockerHost.id, relation: 'runs', inferred: true });
  const applications = new Map<string,string>();
  for (const container of docker.containers) {
    const project = container.composeProject || 'Standalone containers'; const applicationId = `application/${project}`;
    if (!applications.has(project)) { applications.set(project, applicationId); nodes.push({ id: applicationId, type: 'application', name: project, state: 'active', health: 'healthy', source: 'docker' }); edges.push({ from: dockerHost.id, to: applicationId, relation: 'contains', inferred: false }); }
    const containerId = `container/${container.id}`; const health = workloadHealth(container.state, container.health);
    nodes.push({ id: containerId, type: 'container', name: container.composeService || container.name, state: container.state, health, source: 'docker', detail: container.image });
    edges.push({ from: applicationId, to: containerId, relation: 'contains', inferred: false });
    if (health !== 'healthy') { const app = nodes.find(node=>node.id===applicationId); if (app) app.health = health === 'critical' ? 'critical' : app.health === 'critical' ? 'critical' : 'warning'; }
  }
  for (const monitor of monitors) nodes.push({ id: `service/${monitor.id}`, type: 'service', name: monitor.name, state: monitor.lastResult?.status || 'pending', health: monitor.lastResult?.status === 'down' ? 'critical' : monitor.lastResult?.status === 'up' ? 'healthy' : 'unknown', source: 'monitoring', detail: `${monitor.protocol.toUpperCase()} ${monitor.target}` });
  for (const monitor of monitors) {
    const serviceId = `service/${monitor.id}`; const manual = input.mappings.filter(mapping=>mapping.monitorId===monitor.id);
    if (manual.length) {
      for (const mapping of manual) if (nodes.some(node=>node.id===mapping.resourceId)) edges.push({ from: mapping.resourceId, to: serviceId, relation: 'monitors', inferred: false });
    } else {
      const candidates = nodes.filter(node=>node.type!=='service' && node.type!=='node').map(node=>({node,score:matchScore(monitor,node)})).filter(candidate=>candidate.score>0).sort((a,b)=>b.score-a.score);
      if (candidates[0]) edges.push({ from: candidates[0].node.id, to: serviceId, relation: 'monitors', inferred: true });
    }
  }
  const correlations = correlate(nodes, edges, input.incidents);
  const mapped = new Set(edges.filter(edge=>edge.relation==='monitors').map(edge=>edge.to));
  return { collectedAt: new Date().toISOString(), nodes, edges, correlations, mappings: input.mappings, summary: { nodes: nodes.length, relationships: edges.length, services: monitors.length, unhealthyDependencies: nodes.filter(node=>node.type!=='service' && (node.health==='critical'||node.health==='warning')).length, correlatedGroups: correlations.length, unmappedServices: monitors.filter(monitor=>!mapped.has(`service/${monitor.id}`)).length } };
}

function correlate(nodes: TopologyNode[], edges: TopologyEdge[], incidents: CorrelationInput['incidents']): CorrelationGroup[] {
  const active = incidents.filter(incident=>incident.status!=='resolved'); if (!active.length) return [];
  const nodeMap = new Map(nodes.map(node=>[node.id,node])); const incoming = new Map<string,string[]>();
  for (const edge of edges) incoming.set(edge.to,[...(incoming.get(edge.to)||[]),edge.from]);
  const assignments = new Map<string,{incidents:typeof active;distances:number[]}>();
  for (const incident of active) {
    const serviceId=`service/${incident.monitorId}`; const queue=[{id:serviceId,distance:0}]; const seen=new Set<string>(); const candidates:Array<{id:string,distance:number,score:number}>=[];
    while(queue.length){const current=queue.shift()!;if(seen.has(current.id))continue;seen.add(current.id);const node=nodeMap.get(current.id);if(current.distance>0&&node&&(node.health==='critical'||node.health==='warning'))candidates.push({id:node.id,distance:current.distance,score:(node.health==='critical'?60:35)+Math.max(0,20-current.distance*4)});for(const parent of incoming.get(current.id)||[])queue.push({id:parent,distance:current.distance+1});}
    const best=candidates.sort((a,b)=>b.score-a.score)[0]||{id:serviceId,distance:0,score:35}; const group=assignments.get(best.id)||{incidents:[],distances:[]}; group.incidents.push(incident);group.distances.push(best.distance);assignments.set(best.id,group);
  }
  return [...assignments.entries()].map(([rootNodeId,group])=>{const root=nodeMap.get(rootNodeId)!;const incidentNames=group.incidents.map(incident=>nodeMap.get(`service/${incident.monitorId}`)?.name||incident.monitorId);const confidence=Math.min(98,Math.round((root.type==='service'?45:72)+Math.max(0,group.incidents.length-1)*8));const severity:CorrelationGroup['severity']=group.incidents.some(incident=>incident.severity==='critical')?'critical':'warning';return { id:`correlation/${rootNodeId}`, rootNodeId, title: root.type==='service'?`${root.name} failure requires investigation`:`${root.name} is the probable root cause`, explanation: root.type==='service'?`No unhealthy upstream dependency was found, so Sentinel kept this as a service-level incident.`:`${root.name} is unhealthy and sits upstream of ${group.incidents.length} active incident${group.incidents.length===1?'':'s'}.`, confidence, severity, incidentIds:group.incidents.map(incident=>incident.id), affectedServices:incidentNames, evidence:[`${root.name}: ${root.state} / ${root.health}`,`${group.incidents.length} active incident${group.incidents.length===1?'':'s'} share this dependency`, `Shortest dependency distance: ${Math.min(...group.distances)} hop${Math.min(...group.distances)===1?'':'s'}`]};}).sort((a,b)=>b.confidence-a.confidence);
}
