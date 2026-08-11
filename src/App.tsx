import { useEffect, useMemo, useState } from 'react';
import { Activity, Braces, Box, Cable, Check, ChevronDown, CircleAlert, Gauge, Globe2, LayoutDashboard, Menu, Network, Play, Plus, Radio, Search, Settings, ShieldCheck, Timer, X } from 'lucide-react';
import type { Kind, Result, Run, Test } from './types';

const kindMeta: Record<Kind, { label: string; icon: typeof Globe2; className: string }> = {
  frontend: { label: 'Web Frontend', icon: Globe2, className: 'blue' }, api: { label: 'Backend API', icon: Braces, className: 'violet' },
  container: { label: 'Containers', icon: Box, className: 'amber' }, livenx: { label: 'LiveNX', icon: Network, className: 'green' }, livewire: { label: 'LiveWire', icon: Cable, className: 'cyan' }
};

export default function App() {
  const [tests, setTests] = useState<Test[]>([]); const [run, setRun] = useState<Run | null>(null); const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<'all' | Kind>('all'); const [query, setQuery] = useState(''); const [modal, setModal] = useState(false);
  useEffect(() => { fetch('/api/tests').then(r => r.json()).then(setTests).catch(() => {}); }, []);
  const results = useMemo(() => new Map((run?.results || []).map(r => [r.id, r])), [run]);
  const visible = tests.filter(t => (filter === 'all' || t.kind === filter) && t.name.toLowerCase().includes(query.toLowerCase()));
  const passed = run?.results.filter(r => r.status === 'passed').length || 0; const failed = (run?.results.length || 0) - passed;
  const score = run ? Math.round(passed / run.results.length * 100) : 96;
  async function runSuite() { setRunning(true); setRun(null); try { const r = await fetch('/api/runs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ simulate: true }) }); setRun(await r.json()); } finally { setRunning(false); } }
  async function addTest(data: Omit<Test, 'id'>) { const r = await fetch('/api/tests', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); const created = await r.json(); setTests(v => [...v, created]); setModal(false); }

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Activity size={19}/></span><span>Sentinel<span className="brand-accent">Lab</span></span></div>
      <nav><Nav active icon={LayoutDashboard} label="Overview"/><Nav icon={Radio} label="Test suites" count={tests.length}/><Nav icon={Timer} label="Run history"/><Nav icon={ShieldCheck} label="Release gates"/></nav>
      <div className="nav-section">INTEGRATIONS</div>
      <nav><Nav icon={Network} label="LiveNX" dot/><Nav icon={Cable} label="LiveWire" dot/><Nav icon={Box} label="Docker" dot/></nav>
      <div className="side-bottom"><div className="lab-health"><div><span className="pulse"/> LAB HEALTH</div><strong>All systems operational</strong></div><Nav icon={Settings} label="Settings"/></div>
    </aside>
    <main>
      <header><button className="mobile-menu"><Menu/></button><div><span className="crumb">Reliability workspace</span><h1>Durability overview</h1></div><div className="header-actions"><div className="environment"><span/> Staging <ChevronDown size={14}/></div><button className="secondary" onClick={() => setModal(true)}><Plus size={17}/> Add test</button><button className="primary" onClick={runSuite} disabled={running}><Play size={16} fill="currentColor"/>{running ? 'Running suite…' : 'Run full suite'}</button></div></header>
      <section className="content">
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
      </section>
    </main>{modal && <AddModal close={()=>setModal(false)} save={addTest}/>}
  </div>;
}

function Nav({icon:Icon,label,active,count,dot}:{icon:typeof Activity,label:string,active?:boolean,count?:number,dot?:boolean}) { return <button className={`nav-item ${active?'active':''}`}><Icon size={18}/><span>{label}</span>{count!==undefined&&<em>{count}</em>}{dot&&<i/>}</button> }
function Metric({label,value,detail,icon:Icon,tone,gauge}:{label:string,value:string,detail:string,icon:typeof Activity,tone?:string,gauge?:number}) { return <article className="metric"><div className={`metric-icon ${tone||''}`}><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong><small className={tone==='bad'?'red':''}>{detail}</small></div>{gauge&&<div className="mini-gauge"><i style={{width:`${gauge}%`}}/></div>}</article> }
function TestRow({test,result,running}:{test:Test,result?:Result,running:boolean}) { const meta=kindMeta[test.kind], Icon=meta.icon; return <div className="test-row"><div className={`test-icon ${meta.className}`}><Icon size={18}/></div><div className="test-name"><strong>{test.name}</strong><span>{meta.label} · {test.critical?'Release blocking':'Advisory'}</span></div><div className="target">{test.target.replace(/^https?:\/\//,'')}</div><div className="latency">{result?`${result.latency}ms`:'—'}</div><div className={`status ${result?.status|| (running?'running':'idle')}`}>{result?.status==='passed'?<Check size={14}/>:result?.status==='failed'?<X size={14}/>:<span/>}{result?.status|| (running?'running':'ready')}</div></div> }
function Signal({icon:Icon,title,detail,value}:{icon:typeof Activity,title:string,detail:string,value:string}) { return <div className="signal"><span><Icon size={17}/></span><div><strong>{title}</strong><small>{detail}</small></div><em>{value}</em></div> }
function AddModal({close,save}:{close:()=>void,save:(t:Omit<Test,'id'>)=>void}) { const [name,setName]=useState(''); const [target,setTarget]=useState(''); const [kind,setKind]=useState<Kind>('frontend'); return <div className="modal-wrap" onMouseDown={e=>e.target===e.currentTarget&&close()}><form className="modal" onSubmit={e=>{e.preventDefault();save({name,target,kind,critical:true,timeoutMs:10000})}}><button type="button" className="modal-x" onClick={close}><X/></button><span className="eyebrow">NEW CHECK</span><h2>Add a durability test</h2><p>Define a target and include it in the next release-readiness run.</p><label>Test name<input required value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. LiveNX dashboard login"/></label><label>Surface<select value={kind} onChange={e=>setKind(e.target.value as Kind)}>{Object.entries(kindMeta).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}</select></label><label>Target URL<input required type="url" value={target} onChange={e=>setTarget(e.target.value)} placeholder="https://staging.example.com/health"/></label><div className="modal-actions"><button type="button" className="secondary" onClick={close}>Cancel</button><button className="primary">Add to suite</button></div></form></div> }
