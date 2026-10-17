import { useEffect, useState } from 'react';
import type { UnifiedInventory } from './workloadTypes';

export function WorkloadsDashboard() {
  const [data, setData] = useState<UnifiedInventory | null>(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [kind, setKind] = useState('all');
  useEffect(() => {
    setData(null); setError('');
    fetch('/api/workloads?simulate=' + (!live))
      .then(r => { if (!r.ok) throw new Error('Inventory request failed: ' + r.status); return r.json(); })
      .then(setData).catch(e => setError(String(e)));
  }, [live]);
  return <section>
    <h2>Unified Workloads</h2>
    <label>Source <select value={live ? 'live' : 'demo'} onChange={e => setLive(e.target.value === 'live')}>
      <option value="demo">Demo</option><option value="live">Live</option>
    </select></label>
    <label>Type <select value={kind} onChange={e => setKind(e.target.value)}>
      <option value="all">All</option><option value="vm">VM</option><option value="lxc">LXC</option><option value="docker">Docker</option>
    </select></label>
    {error && <p role="alert">{error}</p>}
    {data && <><p>Total {data.summary.total} | Running {data.summary.running} | Unhealthy {data.summary.unhealthy}</p>
      {data.summary.simulated > 0 && <p>Demo data: not live infrastructure status</p>}
      <table><thead><tr><th>Name</th><th>Type</th><th>Host</th><th>Status</th><th>Health</th></tr></thead>
      <tbody>{data.workloads.filter(w => kind === 'all' || w.kind === kind).map(w =>
        <tr key={w.id}><td>{w.name}</td><td>{w.kind}</td><td>{w.host}</td><td>{w.state}</td><td>{w.health}</td></tr>)}</tbody></table>
    </>}
  </section>;
}
