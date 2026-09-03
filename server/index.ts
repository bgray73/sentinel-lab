import express from 'express';
import { defaultTests, runTest, type TestCase, type TestResult } from './runner.js';
import { configFromEnvironment, discoverProxmox } from './proxmox/client.js';
import { simulatedInventory } from './proxmox/inventory.js';
const app = express(); app.use(express.json());
let tests = [...defaultTests]; let history: { id: string; startedAt: string; duration: number; results: TestResult[] }[] = [];

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'sentinel-api' }));
app.get('/api/proxmox/status', (_req, res) => {
  try {
    res.json({ configured: configFromEnvironment() !== null, simulationAvailable: true });
  } catch (error) {
    res.status(400).json({ configured: false, simulationAvailable: true, error: error instanceof Error ? error.message : 'Invalid Proxmox configuration' });
  }
});
app.get('/api/inventory', async (req, res) => {
  const simulate = req.query.simulate !== 'false';
  if (simulate) return res.json(simulatedInventory());
  try {
    const config = configFromEnvironment();
    if (!config) return res.status(503).json({ error: 'Proxmox is not configured. Set PVE_URL, PVE_TOKEN_ID, and PVE_TOKEN_SECRET.' });
    return res.json(await discoverProxmox(config));
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Proxmox discovery failed' });
  }
});
app.get('/api/tests', (_req, res) => res.json(tests));
app.get('/api/runs', (_req, res) => res.json(history));
app.post('/api/tests', (req, res) => { const test = { ...req.body, id: `custom-${Date.now()}` } as TestCase; tests.push(test); res.status(201).json(test); });
app.post('/api/runs', async (req, res) => {
  const started = Date.now(); const selected = req.body?.ids?.length ? tests.filter(t => req.body.ids.includes(t.id)) : tests;
  const results = await Promise.all(selected.map(t => runTest(t, req.body?.simulate !== false).catch(error => ({ ...t, status: 'failed' as const, latency: Date.now() - started, detail: error.message, timestamp: new Date().toISOString() }))));
  const run = { id: `run-${Date.now()}`, startedAt: new Date(started).toISOString(), duration: Date.now() - started, results };
  history = [run, ...history].slice(0, 20); res.json(run);
});
app.listen(4100, () => console.log('Sentinel API listening on http://localhost:4100'));
