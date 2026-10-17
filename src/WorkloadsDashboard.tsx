import { useEffect, useState } from 'react';
import type { UnifiedInventory } from './workloadTypes';

export function WorkloadsDashboard() {
  const [data, setData] = useState<UnifiedInventory | null>(null);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);
  const [kind, setKind] = useState('all');
  const [actionsEnabled, setActionsEnabled] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  useEffect(() => {
    setData(null); setError('');
    fetch('/api/workloads?simulate=' + (!live))
      .then(r => { if (!r.ok) throw new Error('Inventory request failed: ' + r.status); return r.json(); })
      .then(setData).catch(e => setError(String(e)));
  }, [live]);
  useEffect(() => { fetch('/api/workloads/actions/status').then(r => r.ok ? r.json() : null).then(value => setActionsEnabled(Boolean(value?.enabled))).catch(() => setActionsEnabled(false)); }, []);
  async function act(action: 'start' | 'stop' | 'restart', id: string) {
    if (!window.confirm(action.toUpperCase() + ' Docker container ' + id + '?')) return;
    setActionMessage('');
    try {
      const response = await fetch('/api/workloads/docker/actions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, containerId: id, confirmation: action + ':' + id }) });
      if (!response.ok) throw new Error('Action failed (HTTP ' + response.status + ')');
      setActionMessage('Action accepted. Refresh live inventory to confirm state.');
    } catch (error) { setActionMessage(String(error)); }
  }
  return <section>
    <h2>Unified Workloads</h2>
    <label>Source <select value={live ? 'live' : 'demo'} onChange={e => setLive(e.target.value === 'live')}>
      <option value="demo">Demo</option><option value="live">Live</option>
    </select></label>
    <label>Type <select value={kind} onChange={e => setKind(e.target.value)}>
      <option value="all">All</option><option value="vm">VM</option><option value="lxc">LXC</option><option value="docker">Docker</option>
    </select></label>
    {error && <p role="alert">{error}</p>}
    {actionMessage && <p role="status">{actionMessage}</p>}
    {data && <><p>Total {data.summary.total} | Running {data.summary.running} | Unhealthy {data.summary.unhealthy}</p>
      {data.summary.simulated > 0 && <p>Demo data: not live infrastructure status</p>}
      <table><thead><tr><th>Name</th><th>Type</th><th>Host</th><th>Status</th><th>Health</th>{live && actionsEnabled && <th>Actions</th>}</tr></thead>
      <tbody>{data.workloads.filter(w => kind === 'all' || w.kind === kind).map(w =>
        <tr key={w.id}><td>{w.name}</td><td>{w.kind}</td><td>{w.host}</td><td>{w.state}</td><td>{w.health}</td>{live && actionsEnabled && <td>{w.kind === 'docker' && !w.simulated && w.targetId === 'primary' && Boolean(w.containerId) ? <><button onClick={() => void act('start', w.containerId!)}>Start</button><button onClick={() => void act('stop', w.containerId!)}>Stop</button><button onClick={() => void act('restart', w.containerId!)}>Restart</button></> : null}</td>}</tr>)}</tbody></table>
    </>}
  </section>;
}
