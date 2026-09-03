import { useEffect, useMemo, useState } from 'react';
import { Activity, Braces, Box, Boxes, Cable, Check, ChevronDown, CircleAlert, Gauge, Globe2, HardDrive, LayoutDashboard, Menu, Network, Play, Plus, Radio, RefreshCw, Search, Server, Settings, ShieldCheck, Timer, X } from 'lucide-react';
import { formatBytes, groupInventory, percent } from './inventory';
import type { Kind, ProxmoxInventory, ProxmoxResource, Result, Run, Test } from './types';

const kindMeta: Record<Kind, { label: string; icon: typeof Globe2; className: string }> = {
  frontend: { label: 'Web Frontend', icon: Globe2, className: 'blue' }, api: { label: 'Backend API', icon: Braces, className: 'violet' },
  container: { label: 'Containers', icon: Box, className: 'amber' }, livenx: { label: 'LiveNX', icon: Network, className: 'green' }, livewire: { label: 'LiveWire', icon: Cable, className: 'cyan' }
};

export default function App() {
  const [tests, setTests] = useState<Test[]>([]); const [run, setRun] = useState<Run | null>(null); const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<'all' | Kind>('all'); const [query, setQuery] = useState(''); const [modal, setModal] = useState(false);
  const [view, setView] = useState<'overview' | 'infrastructure'>('overview');
  const [inventory, setInventory] = useState<ProxmoxInventory | null>(null); const [inventoryLoading, setInventoryLoading] = useState(true); const [inventoryError, setInventoryError] = useState('');
  useEffect(() => { fetch('/api/tests').then(r => r.json()).then(setTests).catch(() => {}); }, []);
  useEffect(() => { void refreshInventory(); }, []);
  const results = useMemo(() => new Map((run?.results || []).map(r => [r.id, r])), [run]);
  const visible = tests.filter(t => (filter === 'all' || t.kind === filter) && t.name.toLowerCase().includes(query.toLowerCase()));
  const passed = run?.results.filter(r => r.status === 'passed').length || 0; const failed = (run?.results.length || 0) - passed;
  const score = run ? Math.round(passed / run.results.length * 100) : 96;
  async function runSuite() { setRunning(true); setRun(null); try { const r = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ simulate: true }) }); setRun(await r.json()); } finally { setRunning(false); } }
  async function addTest(data: Omit<Test, 'id'>) { const r = await fetch('/api/tests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const created = await r.json(); setTests(v => [...v, created]); setModal(false); }
  async function refreshInventory() { setInventoryLoading(true); setInventoryError(''); try { const response = await fetch('/api/inventory'); if (!response.ok) throw new Error(`Inventory request failed with HTTP ${response.status}`); setInventory(await response.json()); } catch (error) { setInventoryError(error instanceof Error ? error.message : 'Unable to load Proxmox inventory'); } finally { setInventoryLoading(false); } }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Activity size={19}/></span><span>Sentinel<span className="brand-accent">Lab</span></span></div>
      <nav><Nav active={view === 'overview'} icon={LayoutDashboard} label="Overview" onClick={() => setView('overview')}/><Nav icon={Radio} label="Test suites" count={tests.length}/><Nav icon={Timer} label="Run history"/><Nav icon={ShieldCheck} label="Release gates"/></nav>
      <div className="nav-section">INTEGRATIONS</div>
      <nav><Nav active={view === 'infrastructure'} icon={Server} label="Proxmox" dot onClick={() => setView('infrastructure')}/><Nav icon={Network} label="LiveNX" dot/><Nav icon={Cable} label="LiveWire" dot/><Nav icon={Box} label="Docker" dot/></nav>
      <div className="side-bottom"><div className="lab-health"><div><span className="pulse"/> LAB HEALTH</div><strong>All systems operational</strong></div><Nav icon={Settings} label="Settings"/></div>
    </aside>
    <main>
      <header><button className="mobile-menu"><Menu/></button><div><span className="crumb">Reliability workspace</span><h1>{view === 'overview' ? 'Durability overview' : 'Proxmox infrastructure'}</h1></div><div className="header-actions">{view === 'overview' ? <><div className="environment"><span/> Staging <ChevronDown size={14}/></div><button className="secondary" onClick={() => setModal(true)}><Plus size={17}/> Add test</button><button className="primary" onClick={runSuite} disabled={running}><Play size={16} fill="currentColor"/>{running ? 'Running suite…' : 'Run full suite'}</button></> : <button className="secondary" onClick={refreshInventory} disabled={inventoryLoading}><RefreshCw size={16}/>{inventoryLoading ? 'Refreshing…' : 'Refresh inventory'}</button>}</div></header>
      {view === 'overview' ? <section className="content">
        <div className="notice"><span className="notice-icon"><ShieldCheck size={19}/></span><div><strong>Release readiness workspace</strong><p>Continuously validate user journeys, API contracts, container health, and LiveNX ↔ LiveWire telemetry before every release.</p></div><button>Configure gates <ChevronDown size={15}/></button></div>
        <div className="metric-grid">
          <Metric label="Durability score" value={`${score}%`} detail={run ? `${passed} of ${run.results.length} checks passed` : '+2.4% from last release'} icon={Gauge} tone={score > 89 ? 'good' : 'bad'} gauge={score}/>
          <Metric label="Active checks" value={String(tests.length)} detail="Across 5 test surfaces" icon={Activity}/>
          <Metric label="Median response" value={run ? `${Math.round(run.results.reduce((a,r)=>a+r.latency,0)/run.results.length)}ms` : '184ms'} detail="Target threshold < 500ms" icon={Timer}/>
          <Metric label="Regressions" value={String(run ? failed : 2)} detail={run ? failed ? 'Requires review' : 'No regressions found' : '1 critical · 1 moderate'} icon={CircleAlert} tone={failed ? 'bad' : undefined}/>
        </div>
        <div className="main-grid">
          <section className="panel suite-panel"><div className="panel-head"><div><h2>Test surface</h2><p>Coverage and current state across the stack</p></div><div className="search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search checks"/></div></div>
            <div className="tabs"><button className={filter==='all'?'active':''} onClick={()=>setFilter('all')}>All <span>{tests.length}</span></button>{(Object.keys(kindMeta) as Kind[]).map(k=><button key={k} className={filter===k?'active':''} onClick={()=>setFilter(k)}>{kindMeta[k].label}</button>)}</div>
            <div className="test-list">{visible.map(test => <TestRow key={test.id} test={test} result={results.get(test.id)} running={running}/>)}</div>
          </section>
          <aside className="right-col">
            <section className="panel release"><div className="panel-head"><div><h2>Release gate</h2><p>Version 26.2.0-rc3</p></div><span className={failed ? 'gate blocked' : 'gate ready'}>{failed ? 'BLOCKED' : 'READY'}</span></div>
              <div className="ring" style={{'--score': `${score * 3.6}deg`} as React.CSSProperties}><div><strong>{score}</strong><span>/ 100</span></div></div>
              <div className="gate-row"><span><Check size={14}/> Required checks</span><strong>{run ? `${passed}/${run.results.length}` : '7/8'}</strong></div><div className="gate-row"><span><CircleAlert size={14}/> Blocking issues</span><strong className="red">{run ? failed : 1}</strong></div>
              <button className="wide">View gate details</button>
            </section>
            <section className="panel signals"><div className="panel-head"><div><h2>Live telemetry</h2><p>Integration signals</p></div><span className="live"><i/>LIVE</span></div>
              <Signal icon={Network} title="LiveNX telemetry" detail="Last flow 12s ago" value="Healthy"/><Signal icon={Cable} title="LiveWire export" detail="42.8k flows/sec" value="Active"/><Signal icon={Box} title="Container fleet" detail="12 of 12 healthy" value="Stable"/>
              <div className="spark"><span style={{height:'34%'}}/><span style={{height:'46%'}}/><span style={{height:'40%'}}/><span style={{height:'68%'}}/><span style={{height:'58%'}}/><span style={{height:'82%'}}/><span style={{height:'72%'}}/><span style={{height:'88%'}}/><span style={{height:'65%'}}/><span style={{height:'76%'}}/><span style={{height:'84%'}}/><span style={{height:'92%'}}/></div>
            </section>
          </aside>
        </div>
      </section> : <InventoryDashboard inventory={inventory} loading={inventoryLoading} error={inventoryError} refresh={refreshInventory}/>}
    </main>{modal && <AddModal close={()=>setModal(false)} save={addTest}/>}
  </div>;
}

function Nav({icon:Icon,label,active,count,dot,onClick}:{icon:typeof Activity,label:string,active?:boolean,count?:number,dot?:boolean,onClick?:()=>void}) { return <button className={`nav-item ${active?'active':''}`} onClick={onClick}><Icon size={18}/><span>{label}</span>{count!==undefined&&<em>{count}</em>}{dot&&<i/>}</button> }
function Metric({label,value,detail,icon:Icon,tone,gauge}:{label:string,value:string,detail:string,icon:typeof Activity,tone?:string,gauge?:number}) { return <article className="metric"><div className={`metric-icon ${tone||''}`}><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong><small className={tone==='bad'?'red':''}>{detail}</small></div>{gauge&&<div className="mini-gauge"><i style={{width:`${gauge}%`}}/></div>}</article> }
function TestRow({test,result,running}:{test:Test,result?:Result,running:boolean}) { const meta=kindMeta[test.kind], Icon=meta.icon; return <div className="test-row"><div className={`test-icon ${meta.className}`}><Icon size={18}/></div><div className="test-name"><strong>{test.name}</strong><span>{meta.label} · {test.critical?'Release blocking':'Advisory'}</span></div><div className="target">{test.target.replace(/^https?:\/\//,'')}</div><div className="latency">{result?`${result.latency}ms`:'—'}</div><div className={`status ${result?.status|| (running?'running':'idle')}`}>{result?.status==='passed'?<Check size={14}/>:result?.status==='failed'?<X size={14}/>:<span/>}{result?.status|| (running?'running':'ready')}</div></div> }
function Signal({icon:Icon,title,detail,value}:{icon:typeof Activity,title:string,detail:string,value:string}) { return <div className="signal"><span><Icon size={17}/></span><div><strong>{title}</strong><small>{detail}</small></div><em>{value}</em></div> }

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
function AddModal({close,save}:{close:()=>void,save:(t:Omit<Test,'id'>)=>void}) { const [name,setName]=useState(''); const [target,setTarget]=useState(''); const [kind,setKind]=useState<Kind>('frontend'); return <div className="modal-wrap" onMouseDown={e=>e.target===e.currentTarget&&close()}><form className="modal" onSubmit={e=>{e.preventDefault();save({name,target,kind,critical:true,timeoutMs:10000})}}><button type="button" className="modal-x" onClick={close}><X/></button><span className="eyebrow">NEW CHECK</span><h2>Add a durability test</h2><p>Define a target and include it in the next release-readiness run.</p><label>Test name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. LiveNX dashboard login"/></label><label>Surface<select value={kind} onChange={e=>setKind(e.target.value as Kind)}>{Object.entries(kindMeta).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label><label>Target URL<input required type="url" value={target} onChange={e=>setTarget(e.target.value)} placeholder="https://staging.example.com/health"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary">Add to suite</button></div></form></div> }
