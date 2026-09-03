import { useEffect, useMemo, useState } from 'react';
import { Activity, Braces, Box, Boxes, Cable, Check, ChevronDown, CircleAlert, Gauge, Globe2, HardDrive, LayoutDashboard, Menu, Network, Play, Plus, Radio, RefreshCw, Search, Server, Settings, ShieldCheck, Timer, X } from 'lucide-react';
import { formatBytes, groupInventory, percent } from './inventory';
import type { ConnectionStatus, DockerContainer, DockerInventory, Kind, Monitor, MonitorProtocol, MonitorsResponse, ProxmoxInventory, ProxmoxResource, Result, Run, Test } from './types';

const kindMeta: Record<Kind, { label: string; icon: typeof Globe2; className: string }> = {
  frontend: { label: 'Web Frontend', icon: Globe2, className: 'blue' }, api: { label: 'Backend API', icon: Braces, className: 'violet' },
  container: { label: 'Containers', icon: Box, className: 'amber' }, livenx: { label: 'LiveNX', icon: Network, className: 'green' }, livewire: { label: 'LiveWire', icon: Cable, className: 'cyan' }
};

export default function App() {
  const [tests, setTests] = useState<Test[]>([]); const [run, setRun] = useState<Run | null>(null); const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<'all' | Kind>('all'); const [query, setQuery] = useState(''); const [modal, setModal] = useState(false);
  const [view, setView] = useState<'overview' | 'services' | 'infrastructure' | 'docker' | 'connections'>('overview');
  const [inventory, setInventory] = useState<ProxmoxInventory | null>(null); const [inventoryLoading, setInventoryLoading] = useState(true); const [inventoryError, setInventoryError] = useState('');
  const [dockerInventory, setDockerInventory] = useState<DockerInventory | null>(null); const [dockerLoading, setDockerLoading] = useState(true); const [dockerError, setDockerError] = useState('');
  const [connections, setConnections] = useState<ConnectionStatus | null>(null);
  const [monitors, setMonitors] = useState<MonitorsResponse | null>(null); const [monitorsLoading, setMonitorsLoading] = useState(true); const [monitorsError, setMonitorsError] = useState(''); const [monitorModal, setMonitorModal] = useState(false); const [runningMonitors, setRunningMonitors] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { fetch('/api/tests').then(async response => { if (!response.ok) throw new Error(await apiError(response)); return response.json(); }).then(setTests).catch(value => setError(value.message)); }, []);
  useEffect(() => { void refreshInventory(); void refreshDocker(); void refreshConnections(); void refreshMonitors(); }, []);
  const results = useMemo(() => new Map((run?.results || []).map(r => [r.id, r])), [run]);
  const visible = tests.filter(t => (filter === 'all' || t.kind === filter) && t.name.toLowerCase().includes(query.toLowerCase()));
  const passed = run?.gate.passed || 0; const failed = run ? run.gate.total - passed : 0;
  const score = run?.gate.score || 0;
  const medianLatency = run?.results.length ? median(run.results.map(result => result.latency)) : null;
  async function runSuite() { setRunning(true); setRun(null); setError(''); try { const response = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ simulate: true }) }); if (!response.ok) throw new Error(await apiError(response)); setRun(await response.json()); } catch (value) { setError(value instanceof Error ? value.message : 'Unable to run suite'); } finally { setRunning(false); } }
  async function addTest(data: Omit<Test, 'id'>) { setError(''); try { const response = await fetch('/api/tests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); if (!response.ok) throw new Error(await apiError(response)); const created = await response.json(); setTests(value => [...value, created]); setModal(false); } catch (value) { setError(value instanceof Error ? value.message : 'Unable to add test'); } }
  async function refreshInventory() { setInventoryLoading(true); setInventoryError(''); try { const response = await fetch('/api/inventory'); if (!response.ok) throw new Error(`Inventory request failed with HTTP ${response.status}`); setInventory(await response.json()); } catch (error) { setInventoryError(error instanceof Error ? error.message : 'Unable to load Proxmox inventory'); } finally { setInventoryLoading(false); } }
  async function refreshDocker() { setDockerLoading(true); setDockerError(''); try { const response = await fetch('/api/docker/inventory'); if (!response.ok) throw new Error(`Docker request failed with HTTP ${response.status}`); setDockerInventory(await response.json()); } catch (error) { setDockerError(error instanceof Error ? error.message : 'Unable to load Docker inventory'); } finally { setDockerLoading(false); } }
  async function refreshConnections() { try { const response = await fetch('/api/connections'); if (response.ok) setConnections(await response.json()); } catch { setConnections(null); } }
  async function refreshMonitors() { setMonitorsLoading(true); setMonitorsError(''); try { const response = await fetch('/api/monitors'); if (!response.ok) throw new Error(`Monitor request failed with HTTP ${response.status}`); setMonitors(await response.json()); } catch (error) { setMonitorsError(error instanceof Error ? error.message : 'Unable to load service monitors'); } finally { setMonitorsLoading(false); } }
  async function runAllMonitors() { setRunningMonitors(true); try { const response = await fetch('/api/monitors/run-all', { method: 'POST' }); if (!response.ok) throw new Error(`Run failed with HTTP ${response.status}`); await refreshMonitors(); } catch (error) { setMonitorsError(error instanceof Error ? error.message : 'Unable to run monitors'); } finally { setRunningMonitors(false); } }
  async function runMonitor(id:string) { const response = await fetch(`/api/monitors/${encodeURIComponent(id)}/run`, { method:'POST' }); if (!response.ok) throw new Error(`Run failed with HTTP ${response.status}`); await refreshMonitors(); }
  async function addMonitor(input:{name:string;protocol:MonitorProtocol;target:string;intervalSeconds:number;timeoutMs:number;expectedStatus?:number}) { const response = await fetch('/api/monitors', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(input) }); const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Unable to add monitor'); setMonitorModal(false); await refreshMonitors(); }
  const viewTitle = ({ overview: 'Durability overview', services: 'Service monitoring', infrastructure: 'Proxmox infrastructure', docker: 'Docker applications', connections: 'Connections' } as const)[view];

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Activity size={19}/></span><span>Sentinel<span className="brand-accent">Lab</span></span></div>
      <nav><Nav active={view === 'overview'} icon={LayoutDashboard} label="Overview" onClick={() => setView('overview')}/><Nav active={view === 'services'} icon={Activity} label="Services" count={monitors?.monitors.length} onClick={() => setView('services')}/><Nav icon={Radio} label="Test suites" count={tests.length}/><Nav icon={Timer} label="Run history"/><Nav icon={ShieldCheck} label="Release gates"/></nav>
      <div className="nav-section">INTEGRATIONS</div>
      <nav><Nav active={view === 'infrastructure'} icon={Server} label="Proxmox" dot onClick={() => setView('infrastructure')}/><Nav icon={Network} label="LiveNX" dot/><Nav icon={Cable} label="LiveWire" dot/><Nav active={view === 'docker'} icon={Box} label="Docker" dot onClick={() => setView('docker')}/></nav>
      <div className="side-bottom"><div className="lab-health"><div><span className="pulse"/> LAB HEALTH</div><strong>All systems operational</strong></div><Nav active={view === 'connections'} icon={Settings} label="Connections" onClick={() => setView('connections')}/></div>
    </aside>
    <main>
      <header><button className="mobile-menu"><Menu/></button><div><span className="crumb">Reliability workspace</span><h1>{viewTitle}</h1></div><div className="header-actions">{view === 'overview' ? <><div className="environment"><span/> Staging <ChevronDown size={14}/></div><button className="secondary" onClick={() => setModal(true)}><Plus size={17}/> Add test</button><button className="primary" onClick={runSuite} disabled={running}><Play size={16} fill="currentColor"/>{running ? 'Running suite…' : 'Run full suite'}</button></> : view === 'services' ? <><button className="secondary" onClick={() => setMonitorModal(true)}><Plus size={16}/>Add monitor</button><button className="primary" onClick={runAllMonitors} disabled={runningMonitors}><Play size={15}/>{runningMonitors ? 'Running…' : 'Run all'}</button></> : view === 'infrastructure' ? <button className="secondary" onClick={refreshInventory} disabled={inventoryLoading}><RefreshCw size={16}/>{inventoryLoading ? 'Refreshing…' : 'Refresh inventory'}</button> : view === 'docker' ? <button className="secondary" onClick={refreshDocker} disabled={dockerLoading}><RefreshCw size={16}/>{dockerLoading ? 'Refreshing…' : 'Refresh containers'}</button> : <button className="secondary" onClick={refreshConnections}><RefreshCw size={16}/>Refresh status</button>}</div></header>
      {view === 'overview' ? <section className="content">
        {error && <div className="error-banner" role="alert"><CircleAlert size={17}/><span>{error}</span><button onClick={() => setError('')} aria-label="Dismiss error"><X size={15}/></button></div>}
        <div className="notice"><span className="notice-icon"><ShieldCheck size={19}/></span><div><strong>Release readiness workspace</strong><p>Continuously validate user journeys, API contracts, container health, and LiveNX ↔ LiveWire telemetry before every release.</p></div><button>Configure gates <ChevronDown size={15}/></button></div>
        <div className="metric-grid">
          <Metric label="Durability score" value={run ? `${score}%` : '—'} detail={run ? `${passed} of ${run.results.length} checks passed` : 'Run the suite to calculate'} icon={Gauge} tone={run ? (score > 89 ? 'good' : 'bad') : undefined} gauge={run ? score : undefined}/>
          <Metric label="Active checks" value={String(tests.length)} detail="Across 5 test surfaces" icon={Activity}/>
          <Metric label="Median response" value={medianLatency === null ? '—' : `${medianLatency}ms`} detail="Target threshold < 500ms" icon={Timer}/>
          <Metric label="Regressions" value={run ? String(failed) : '—'} detail={run ? failed ? `${run.gate.criticalFailures} release blocking` : 'No regressions found' : 'No run results yet'} icon={CircleAlert} tone={failed ? 'bad' : undefined}/>
        </div>
        <div className="main-grid">
          <section className="panel suite-panel"><div className="panel-head"><div><h2>Test surface</h2><p>Coverage and current state across the stack</p></div><div className="search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search checks"/></div></div>
            <div className="tabs"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>All <span>{tests.length}</span></button>{(Object.keys(kindMeta) as Kind[]).map(k=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{kindMeta[k].label}</button>)}</div>
            <div className="test-list">{visible.map(test => <TestRow key={test.id} test={test} result={results.get(test.id)} running={running}/>)}</div>
          </section>
          <aside className="right-col">
            <section className="panel release"><div className="panel-head"><div><h2>Release gate</h2><p>{run ? `Run ${run.id.slice(0, 12)}` : 'Awaiting first run'}</p></div><span className={`gate ${run?.gate.status || 'blocked'}`}>{run?.gate.status.toUpperCase() || 'PENDING'}</span></div>
              <div className="ring" style={{'--score': `${score * 3.6}deg`} as React.CSSProperties}><div><strong>{score}</strong><span>/ 100</span></div></div>
              <div className="gate-row"><span><Check size={14}/> Required checks</span><strong>{run ? `${passed}/${run.results.length}` : '—'}</strong></div><div className="gate-row"><span><CircleAlert size={14}/> Blocking issues</span><strong className="red">{run ? run.gate.criticalFailures : '—'}</strong></div>
              <button className="wide">View gate details</button>
            </section>
            <section className="panel signals"><div className="panel-head"><div><h2>Live telemetry</h2><p>Integration signals</p></div><span className="live"><i/>LIVE</span></div>
              <Signal icon={Network} title="LiveNX telemetry" detail="Last flow 12s ago" value="Healthy"/><Signal icon={Cable} title="LiveWire export" detail="42.8k flows/sec" value="Active"/><Signal icon={Box} title="Container fleet" detail="12 of 12 healthy" value="Stable"/>
              <div className="spark"><span style={{height:'34%'}}/><span style={{height:'46%'}}/><span style={{height:'40%'}}/><span style={{height:'68%'}}/><span style={{height:'58%'}}/><span style={{height:'82%'}}/><span style={{height:'72%'}}/><span style={{height:'88%'}}/><span style={{height:'65%'}}/><span style={{height:'76%'}}/><span style={{height:'84%'}}/><span style={{height:'92%'}}/></div>
            </section>
          </aside>
        </div>
      </section> : view === 'services' ? <ServicesDashboard data={monitors} loading={monitorsLoading} error={monitorsError} refresh={refreshMonitors} runMonitor={runMonitor}/> : view === 'infrastructure' ? <InventoryDashboard inventory={inventory} loading={inventoryLoading} error={inventoryError} refresh={refreshInventory}/> : view === 'docker' ? <DockerDashboard inventory={dockerInventory} loading={dockerLoading} error={dockerError} refresh={refreshDocker}/> : <ConnectionsDashboard status={connections}/>}
    </main>{modal && <AddModal close={()=>setModal(false)} save={addTest}/>}{monitorModal && <AddMonitorModal close={() => setMonitorModal(false)} save={addMonitor}/>}
  </div>;
}

function Nav({icon:Icon,label,active,count,dot,onClick}:{icon:typeof Activity,label:string,active?:boolean,count?:number,dot?:boolean,onClick?:()=>void}) { return <button className={`nav-item ${active?'active':''}`} onClick={onClick}><Icon size={18}/><span>{label}</span>{count!==undefined&&<em>{count}</em>}{dot&&<i/>}</button> }
function Metric({label,value,detail,icon:Icon,tone,gauge}:{label:string,value:string,detail:string,icon:typeof Activity,tone?:string,gauge?:number}) { return <article className="metric"><div className={`metric-icon ${tone||''}`}><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong><small className={tone==='bad'?'red':''}>{detail}</small></div>{gauge&&<div className="mini-gauge"><i style={{width:`${gauge}%`}}/></div>}</article> }
function TestRow({test,result,running}:{test:Test,result?:Result,running:boolean}) { const meta=kindMeta[test.kind], Icon=meta.icon; return <div className="test-row"><div className={`test-icon ${meta.className}`}><Icon size={18}/></div><div className="test-name"><strong>{test.name}</strong><span>{meta.label} · {test.critical?'Release blocking':'Advisory'}</span></div><div className="target">{test.target.replace(/^https?:\/\//,'')}</div><div className="latency">{result?`${result.latency}ms`:'—'}</div><div className={`status ${result?.status|| (running?'running':'idle')}`}>{result?.status==='passed'?<Check size={14}/>:result?.status==='failed'?<X size={14}/>:<span/>}{result?.status|| (running?'running':'ready')}</div></div> }
function Signal({icon:Icon,title,detail,value}:{icon:typeof Activity,title:string,detail:string,value:string}) { return <div className="signal"><span><Icon size={17}/></span><div><strong>{title}</strong><small>{detail}</small></div><em>{value}</em></div> }

function ServicesDashboard({data,loading,error,refresh,runMonitor}:{data:MonitorsResponse|null,loading:boolean,error:string,refresh:()=>void,runMonitor:(id:string)=>Promise<void>}) {
  const [runningId,setRunningId]=useState('');
  if (loading && !data) return <section className="content"><div className="inventory-state"><RefreshCw className="spin"/><strong>Loading service monitors…</strong><span>Reading schedules, results, and persistent history.</span></div></section>;
  if (error && !data) return <section className="content"><div className="inventory-state error-state"><CircleAlert/><strong>Service monitoring unavailable</strong><span>{error}</span><button className="secondary" onClick={refresh}>Try again</button></div></section>;
  if (!data) return null;
  const up = data.monitors.filter(monitor => monitor.lastResult?.status === 'up').length; const down = data.monitors.filter(monitor => monitor.lastResult?.status === 'down').length;
  const scores = data.monitors.map(monitor => monitor.healthScore).filter((score):score is number => score !== null); const overall = scores.length ? Math.round(scores.reduce((sum,score) => sum + score,0) / scores.length) : null;
  async function run(id:string) { setRunningId(id); try { await runMonitor(id); } finally { setRunningId(''); } }
  return <section className="content infrastructure-content">
    <div className="inventory-banner services-banner"><div><span className={`source-badge ${data.mode === 'live' ? 'proxmox' : 'simulation'}`}>{data.mode === 'live' ? 'LIVE CHECKS' : 'SIMULATION'}</span><strong>Application and service health</strong><p>{data.mode === 'live' ? 'Scheduled outbound checks are enabled.' : 'Safe simulated results are active. Set SENTINEL_REAL_CHECKS=true to enable network checks.'}</p></div></div>
    {error && <div className="inline-error"><CircleAlert size={15}/>{error}</div>}
    <div className="metric-grid inventory-metrics"><Metric label="Health score" value={overall === null ? '—' : `${overall}%`} detail="Availability plus response time" icon={Gauge} tone={overall !== null && overall < 80 ? 'bad' : 'good'}/><Metric label="Services up" value={String(up)} detail="Latest check succeeded" icon={Check} tone="good"/><Metric label="Services down" value={String(down)} detail={down ? 'Requires investigation' : 'No current failures'} icon={CircleAlert} tone={down ? 'bad' : 'good'}/><Metric label="Scheduled checks" value={String(data.monitors.length)} detail="HTTP, TCP, and DNS" icon={Timer}/></div>
    <section className="panel monitors-panel"><div className="panel-head"><div><h2>Service monitors</h2><p>Automatic checks with persistent result history</p></div><span className="resource-count">30 sec minimum interval</span></div>{data.monitors.length ? <div className="monitor-list">{data.monitors.map(monitor => <MonitorRow key={monitor.id} monitor={monitor} running={runningId===monitor.id} run={() => run(monitor.id)}/>)}</div> : <div className="empty-monitors"><Activity/><strong>No monitors configured</strong><span>Add an HTTP, TCP, or DNS check to begin monitoring.</span></div>}</section>
  </section>;
}

function MonitorRow({monitor,running,run}:{monitor:Monitor,running:boolean,run:()=>void}) {
  const Icon = monitor.protocol === 'http' ? Globe2 : monitor.protocol === 'tcp' ? Cable : Network; const status = monitor.lastResult?.status || 'pending';
  return <article className="monitor-row"><span className={`monitor-protocol ${monitor.protocol}`}><Icon size={17}/></span><div className="monitor-name"><strong>{monitor.name}</strong><small>{monitor.protocol.toUpperCase()} · {monitor.target}</small></div><div className="monitor-stat"><span>UPTIME</span><strong>{monitor.uptimePercent === null ? '—' : `${monitor.uptimePercent}%`}</strong></div><div className="monitor-stat"><span>HEALTH</span><strong>{monitor.healthScore === null ? '—' : `${monitor.healthScore}%`}</strong></div><div className="monitor-stat"><span>LATENCY</span><strong>{monitor.lastResult ? `${monitor.lastResult.latencyMs}ms` : '—'}</strong></div><span className={`monitor-status ${status}`}><i/>{status}</span><button className="monitor-run" onClick={run} disabled={running}>{running ? 'Running…' : 'Run'}</button><div className="monitor-detail">Every {monitor.intervalSeconds}s · {monitor.lastResult ? `${monitor.lastResult.detail} · ${new Date(monitor.lastResult.checkedAt).toLocaleTimeString()}` : 'Waiting for first result'}</div></article>;
}

function InventoryDashboard({inventory,loading,error,refresh}:{inventory:ProxmoxInventory|null,loading:boolean,error:string,refresh:()=>void}) {
  if (loading && !inventory) return <section className="content"><div className="inventory-state"><RefreshCw className="spin"/><strong>Discovering Proxmox resources…</strong><span>Reading nodes, workloads, and storage.</span></div></section>;
  if (error && !inventory) return <section className="content"><div className="inventory-state error-state"><CircleAlert/><strong>Inventory unavailable</strong><span>{error}</span><button className="secondary" onClick={refresh}>Try again</button></div></section>;
  if (!inventory) return null;
  const groups = groupInventory(inventory);
  const workloads = inventory.summary.virtualMachines + inventory.summary.lxcContainers;

  return <section className="content infrastructure-content">
    <div className="inventory-banner"><div><span className={`source-badge ${inventory.source}`}>{inventory.source === 'simulation' ? 'SIMULATION' : 'LIVE PROXMOX'}</span><strong>{inventory.clusterName}</strong><p>{inventory.source === 'simulation' ? 'Safe sample data is active. Configure a read-only token when you are ready to connect the lab.' : 'Read-only inventory collected directly from the Proxmox API.'}</p></div><small>Updated {new Date(inventory.collectedAt).toLocaleTimeString()}</small></div>
    {error && <div className="inline-error"><CircleAlert size={15}/>{error}. Displaying the last successful inventory.</div>}
    <div className="metric-grid inventory-metrics">
      <Metric label="Cluster nodes" value={String(inventory.summary.nodes)} detail="Proxmox hosts discovered" icon={Server} tone="good"/>
      <Metric label="VMs and LXC" value={String(workloads)} detail={`${inventory.summary.runningWorkloads} running · ${inventory.summary.stoppedWorkloads} stopped`} icon={Boxes}/>
      <Metric label="Storage pools" value={String(inventory.summary.storagePools)} detail="Capacity checks enabled" icon={HardDrive}/>
      <Metric label="Health warnings" value={String(inventory.summary.warnings)} detail={inventory.summary.warnings ? 'Needs review' : 'No infrastructure warnings'} icon={CircleAlert} tone={inventory.summary.warnings ? 'bad' : 'good'}/>
    </div>
    <section className="panel inventory-panel"><div className="panel-head"><div><h2>Infrastructure hierarchy</h2><p>Proxmox node → VM or LXC → application monitoring in the next stage</p></div><span className="resource-count">{inventory.resources.length} resources</span></div>
      <div className="node-grid">{groups.map(group => <NodeCard key={group.node.id} node={group.node} workloads={group.workloads} storage={group.storage}/>)}</div>
    </section>
  </section>;
}

function NodeCard({node,workloads,storage}:{node:ProxmoxResource,workloads:ProxmoxResource[],storage:ProxmoxResource[]}) {
  const memory = percent(node.memoryUsedBytes,node.memoryTotalBytes); const running = workloads.filter(item => item.state === 'running').length;
  return <article className="node-card">
    <div className="node-head"><span className="node-icon"><Server size={18}/></span><div><strong>{node.name}</strong><small>{node.state} · {running}/{workloads.length} workloads running</small></div><HealthBadge health={node.health}/></div>
    <div className="node-usage"><Usage label="CPU" value={node.cpuPercent === undefined ? null : Math.round(node.cpuPercent)}/><Usage label="Memory" value={memory}/></div>
    <div className="resource-section"><span className="resource-title">WORKLOADS</span>{workloads.length ? workloads.map(item => <ResourceRow key={item.id} resource={item}/>) : <div className="empty-resource">No VMs or LXC containers discovered</div>}</div>
    <div className="resource-section"><span className="resource-title">STORAGE</span>{storage.length ? storage.map(item => <ResourceRow key={item.id} resource={item}/>) : <div className="empty-resource">No node storage reported</div>}</div>
  </article>;
}

function ResourceRow({resource}:{resource:ProxmoxResource}) {
  const Icon = resource.type === 'storage' ? HardDrive : resource.type === 'lxc' ? Box : Server;
  const utilization = resource.type === 'storage' ? percent(resource.diskUsedBytes,resource.diskTotalBytes) : percent(resource.memoryUsedBytes,resource.memoryTotalBytes);
  const detail = resource.type === 'storage' ? `${formatBytes(resource.diskUsedBytes)} / ${formatBytes(resource.diskTotalBytes)}` : `${resource.type.toUpperCase()}${resource.vmid ? ` ${resource.vmid}` : ''} · ${resource.state}`;
  return <div className="resource-row"><span><Icon size={15}/></span><div><strong>{resource.name}</strong><small>{detail}</small></div>{utilization !== null && <em>{utilization}%</em>}<HealthBadge health={resource.health}/></div>;
}

function Usage({label,value}:{label:string,value:number|null}) { return <div><span>{label}<em>{value === null ? '—' : `${value}%`}</em></span><div className="usage-track"><i style={{width:`${value || 0}%`}}/></div></div> }
function HealthBadge({health}:{health:ProxmoxResource['health']}) { return <span className={`health-badge ${health}`}><i/>{health}</span> }

function DockerDashboard({inventory,loading,error,refresh}:{inventory:DockerInventory|null,loading:boolean,error:string,refresh:()=>void}) {
  if (loading && !inventory) return <section className="content"><div className="inventory-state"><RefreshCw className="spin"/><strong>Discovering Docker applications…</strong><span>Reading containers, health checks, ports, and Compose labels.</span></div></section>;
  if (error && !inventory) return <section className="content"><div className="inventory-state error-state"><CircleAlert/><strong>Docker inventory unavailable</strong><span>{error}</span><button className="secondary" onClick={refresh}>Try again</button></div></section>;
  if (!inventory) return null;
  const grouped = inventory.containers.reduce<Record<string,DockerContainer[]>>((projects,container) => { const key = container.composeProject || 'Standalone containers'; (projects[key] ||= []).push(container); return projects; }, {});
  return <section className="content infrastructure-content">
    <div className="inventory-banner docker-banner"><div><span className={`source-badge ${inventory.source}`}>{inventory.source === 'simulation' ? 'SIMULATION' : 'LIVE DOCKER'}</span><strong>{inventory.engineName}</strong><p>{inventory.source === 'simulation' ? 'Sample application data is active. Configure a Docker socket to discover the real container host.' : `Docker Engine ${inventory.engineVersion || ''} · read-only discovery`}</p></div><small>Updated {new Date(inventory.collectedAt).toLocaleTimeString()}</small></div>
    {error && <div className="inline-error"><CircleAlert size={15}/>{error}. Displaying the last successful container inventory.</div>}
    <div className="metric-grid inventory-metrics">
      <Metric label="Containers" value={String(inventory.summary.total)} detail={`${inventory.summary.running} running · ${inventory.summary.stopped} stopped`} icon={Box}/>
      <Metric label="Healthy" value={String(inventory.summary.healthy)} detail="Docker health checks passing" icon={ShieldCheck} tone="good"/>
      <Metric label="Unhealthy" value={String(inventory.summary.unhealthy)} detail={inventory.summary.unhealthy ? 'Immediate review required' : 'No failed health checks'} icon={CircleAlert} tone={inventory.summary.unhealthy ? 'bad' : 'good'}/>
      <Metric label="Compose projects" value={String(inventory.summary.composeProjects)} detail="Application groups discovered" icon={Boxes}/>
    </div>
    <section className="panel inventory-panel"><div className="panel-head"><div><h2>Application inventory</h2><p>Compose project → service → container health and exposed ports</p></div><span className="resource-count">{Object.keys(grouped).length} groups</span></div>
      <div className="app-grid">{Object.entries(grouped).map(([project,containers]) => <article className="app-card" key={project}><div className="app-head"><span><Boxes size={17}/></span><div><strong>{project}</strong><small>{containers.length} service{containers.length === 1 ? '' : 's'}</small></div><HealthBadge health={containers.some(item => item.health === 'critical') ? 'critical' : containers.some(item => item.health === 'warning') ? 'warning' : 'healthy'}/></div>{containers.map(container => <ContainerRow key={container.id} container={container}/>)}</article>)}</div>
    </section>
  </section>;
}

function ContainerRow({container}:{container:DockerContainer}) {
  const ports = container.ports.filter(port => port.publicPort).map(port => `${port.publicPort}:${port.privatePort}/${port.protocol}`).join(', ');
  return <div className="container-row"><span><Box size={15}/></span><div><strong>{container.composeService || container.name}</strong><small>{container.image}</small><em>{ports || 'No published ports'} · {container.status}</em></div><HealthBadge health={container.health}/></div>;
}

function ConnectionsDashboard({status}:{status:ConnectionStatus|null}) {
  return <section className="content connections-content">
    <div className="notice"><span className="notice-icon"><ShieldCheck size={19}/></span><div><strong>Credentials stay outside Sentinel</strong><p>Connections use environment variables and read-only permissions. Tokens and socket credentials are never returned to the browser.</p></div></div>
    <div className="connection-grid">
      <ConnectionCard icon={Server} name="Proxmox VE" configured={status?.proxmox.configured} description="Discovers cluster nodes, QEMU VMs, LXC containers, storage, state, and utilization." variables={["PVE_URL=https://proxmox.example:8006","PVE_TOKEN_ID=sentinel@pve!monitoring","PVE_TOKEN_SECRET=replace-with-token-secret"]}/>
      <ConnectionCard icon={Box} name="Docker Engine" configured={status?.docker.configured} description="Discovers containers, Compose projects, health checks, images, state, and published ports." variables={["DOCKER_SOCKET_PATH=/var/run/docker.sock"]}/>
    </div>
    <section className="panel safety-panel"><div className="panel-head"><div><h2>Connection safety</h2><p>Recommended permissions before enabling live discovery</p></div></div><div className="safety-list"><div><Check size={15}/><span><strong>Proxmox</strong>Use a dedicated API token with the PVEAuditor role at `/`.</span></div><div><Check size={15}/><span><strong>TLS</strong>Trust the Proxmox certificate or private CA on the Sentinel host.</span></div><div><Check size={15}/><span><strong>Docker</strong>Mount the socket read-only and never expose the Docker API publicly.</span></div><div><Check size={15}/><span><strong>Secrets</strong>Supply values through the service environment or a secrets manager.</span></div></div></section>
  </section>;
}

function ConnectionCard({icon:Icon,name,configured,description,variables}:{icon:typeof Server,name:string,configured?:boolean,description:string,variables:string[]}) {
  return <article className="connection-card"><div className="connection-head"><span><Icon size={20}/></span><div><h2>{name}</h2><p>{description}</p></div><span className={`connection-status ${configured ? 'configured' : 'setup'}`}><i/>{configured ? 'Configured' : 'Setup required'}</span></div><div className="env-block"><span>ENVIRONMENT VARIABLES</span>{variables.map(variable => <code key={variable}>{variable}</code>)}</div><small>{configured ? 'Configuration detected by the Sentinel API.' : 'Add these values to the Sentinel API environment, then restart the service.'}</small></article>;
}
function AddMonitorModal({close,save}:{close:()=>void,save:(input:{name:string;protocol:MonitorProtocol;target:string;intervalSeconds:number;timeoutMs:number;expectedStatus?:number})=>Promise<void>}) {
  const [name,setName]=useState(''); const [protocol,setProtocol]=useState<MonitorProtocol>('http'); const [target,setTarget]=useState(''); const [interval,setIntervalValue]=useState(60); const [error,setError]=useState(''); const [saving,setSaving]=useState(false);
  const placeholder = protocol === 'http' ? 'https://app.example.com/health' : protocol === 'tcp' ? 'database.local:5432' : 'app.example.com';
  return <div className="modal-wrap" onMouseDown={event=>event.target===event.currentTarget&&close()}><form className="modal" onSubmit={async event=>{event.preventDefault();setSaving(true);setError('');try{await save({name,protocol,target,intervalSeconds:interval,timeoutMs:5000,expectedStatus:protocol==='http'?200:undefined})}catch(value){setError(value instanceof Error?value.message:'Unable to add monitor')}finally{setSaving(false)}}}><button type="button" className="modal-x" onClick={close}><X/></button><span className="eyebrow">SERVICE MONITOR</span><h2>Add a health check</h2><p>Sentinel will run this check automatically and retain its recent results.</p>{error&&<div className="form-error">{error}</div>}<label>Monitor name<input required value={name} onChange={event=>setName(event.target.value)} placeholder="e.g. Plex web interface"/></label><label>Protocol<select value={protocol} onChange={event=>setProtocol(event.target.value as MonitorProtocol)}><option value="http">HTTP / HTTPS</option><option value="tcp">TCP port</option><option value="dns">DNS lookup</option></select></label><label>Target<input required value={target} onChange={event=>setTarget(event.target.value)} placeholder={placeholder}/></label><label>Check interval<select value={interval} onChange={event=>setIntervalValue(Number(event.target.value))}><option value={30}>Every 30 seconds</option><option value={60}>Every minute</option><option value={300}>Every 5 minutes</option><option value={900}>Every 15 minutes</option></select></label><div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary" disabled={saving}>{saving?'Adding…':'Add monitor'}</button></div></form></div>;
}
function AddModal({close,save}:{close:()=>void,save:(t:Omit<Test,'id'>)=>void}) { const [name,setName]=useState(''); const [target,setTarget]=useState(''); const [kind,setKind]=useState<Kind>('frontend'); return <div className="modal-wrap" onMouseDown={e=>e.target===e.currentTarget&&close()}><form className="modal" onSubmit={e=>{e.preventDefault();save({name,target,kind,critical:true,timeoutMs:10000})}}><button type="button" className="modal-x" onClick={close}><X/></button><span className="eyebrow">NEW CHECK</span><h2>Add a durability test</h2><p>Define a target and include it in the next release-readiness run.</p><label>Test name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. LiveNX dashboard login"/></label><label>Surface<select value={kind} onChange={e=>setKind(e.target.value as Kind)}>{Object.entries(kindMeta).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label><label>Target URL<input required type="url" value={target} onChange={e=>setTarget(e.target.value)} placeholder="https://staging.example.com/health"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary">Add to suite</button></div></form></div> }

function median(values: number[]) { const sorted = [...values].sort((a, b) => a - b); const middle = Math.floor(sorted.length / 2); return Math.round(sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2); }
async function apiError(response: Response) { try { const body = await response.json(); return body.error || `Request failed (${response.status})`; } catch { return `Request failed (${response.status})`; } }
