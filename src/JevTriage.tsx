import { useEffect, useState } from 'react';
import type { Incident } from './types';

type Result = { incidentId: string; mode: string; category: string; confidence: number | null; analyzedAt: string; dependencies?: { availability:string; truncated:boolean; resources:{type:string;healthy:number;warning:number;critical:number;unknown:number}[] } };
export function JevTriage({ incidents }: { incidents: Incident[] }) {
  const [status, setStatus] = useState<{ mode: string; configured: boolean; payload: string } | null>(null);
  const [admin, setAdmin] = useState(false);
  const [selected, setSelected] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { let active = true; Promise.all([fetch('/api/integrations/jev'), fetch('/api/session')]).then(async ([a,b]) => {
    if (!a.ok || !b.ok) throw new Error('Unavailable');
    const [config, session] = await Promise.all([a.json(),b.json()]);
    if (active) { setStatus(config); setAdmin(session.permissions.administer); }
  }).catch(() => { if (active) setError('Jev configuration unavailable'); }); return () => { active = false; }; }, []);
  async function analyze() {
    setBusy(true); setError(''); setResult(null);
    try {
      const response = await fetch(`/api/integrations/jev/incidents/${encodeURIComponent(selected)}/analyze`, { method: 'POST' });
      const body = await response.json(); if (!response.ok) throw new Error(body.error || 'Analysis failed'); setResult(body);
    } catch (e) { setError(e instanceof Error ? e.message : 'Analysis failed'); } finally { setBusy(false); }
  }
  return <section className="panel" style={{padding:16}} aria-label="Jev incident triage">
    <h2>Jev-assisted triage · {status?.mode || 'unavailable'}</h2>
    <p>Advisory only. No alerts or infrastructure are changed. {status?.payload}</p>
    {status?.mode === 'live' && <p>Clicking Analyze sends these limited fields to TypeSafe AI. Provider charges may apply.</p>}
    <label>Active incident <select value={selected} disabled={busy} onChange={e=>{setSelected(e.target.value);setResult(null);}}><option value="">Select an incident</option>{incidents.filter(i=>i.status!=='resolved').map(i=><option key={i.id} value={i.id}>{i.title}</option>)}</select></label>
    <button className="secondary" disabled={!admin || !status?.configured || !selected || busy} onClick={analyze}>{busy?'Analyzing…':'Analyze with Jev'}</button>
    {!admin && <p>Administrator access is required to request analysis.</p>}
    {status && !status.configured && <p>Configure the server-side TypeSafe API key before requesting live analysis.</p>}
    {error && <p role="alert">{error}</p>}
    {result?.dependencies && <details><summary>Dependency evidence: {result.dependencies.availability.replaceAll('_',' ')}</summary><p>CMDB snapshots are evidence for investigation, not proof of a root cause. Unknown health does not mean healthy.</p>{result.dependencies.truncated && <p>Limited to 100 dependencies; evidence is incomplete.</p>}<ul>{result.dependencies.resources.map(item=><li key={item.type}>{item.type.replaceAll('_',' ')}: {item.healthy} healthy, {item.warning} warning, {item.critical} critical, {item.unknown} unknown</li>)}</ul></details>}
    {result && <div role="status"><strong>{result.mode === 'simulation' ? 'SIMULATED — no provider request' : 'Jev suggestion'}: {result.category.replaceAll('_',' ')}</strong><p>{result.confidence === null ? 'Demo only; no model confidence.' : `Model confidence: ${Math.round(result.confidence*100)}% — not a guarantee of correctness.`} Human review required. Analyzed {new Date(result.analyzedAt).toLocaleString()}.</p></div>}
  </section>;
}
