import express from 'express';
import { defaultTests, runTest, type TestCase, type TestResult } from './runner.js';
import { configFromEnvironment, discoverProxmox } from './proxmox/client.js';
import { simulatedInventory } from './proxmox/inventory.js';
import { discoverDocker, dockerConfigFromEnvironment } from './docker/client.js';
import { simulatedDockerInventory } from './docker/inventory.js';
import { MonitoringService } from './monitoring/service.js';
const app = express(); app.use(express.json());
let tests = [...defaultTests]; let history: { id: string; startedAt: string; duration: number; results: TestResult[] }[] = [];
const monitoring = new MonitoringService();

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'sentinel-api' }));
app.get('/api/monitors', async (_req, res) => { await monitoring.ready; res.json({ mode: monitoring.mode(), monitors: monitoring.list() }); });
app.get('/api/monitors/history', async (req, res) => { await monitoring.ready; res.json(monitoring.history(typeof req.query.monitorId === 'string' ? req.query.monitorId : undefined, Number(req.query.limit || 100))); });
app.post('/api/monitors', async (req, res) => { try { await monitoring.ready; res.status(201).json(await monitoring.add(req.body || {})); } catch (error) { res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid monitor' }); } });
app.post('/api/monitors/run-all', async (_req, res) => { await monitoring.ready; res.json(await monitoring.runAll()); });
app.post('/api/monitors/:id/run', async (req, res) => { try { await monitoring.ready; res.json(await monitoring.run(req.params.id)); } catch (error) { res.status(404).json({ error: error instanceof Error ? error.message : 'Monitor not found' }); } });
app.get('/api/proxmox/status', (_req, res) => {
  try {
    res.json({ configured: configFromEnvironment() !== null, simulationAvailable: true });
  } catch (error) {
    res.status(400).json({ configured: false, simulationAvailable: true, error: error instanceof Error ? error.message : 'Invalid Proxmox configuration' });
  }
});
app.get('/api/connections', (_req, res) => {
  const connections = { proxmox: { configured: false }, docker: { configured: false } };
  try { connections.proxmox.configured = configFromEnvironment() !== null; } catch { connections.proxmox.configured = false; }
  try { connections.docker.configured = dockerConfigFromEnvironment() !== null; } catch { connections.docker.configured = false; }
  res.json(connections);
});
app.get('/api/docker/status', (_req, res) => {
  try { res.json({ configured: dockerConfigFromEnvironment() !== null, simulationAvailable: true }); }
  catch (error) { res.status(400).json({ configured: false, simulationAvailable: true, error: error instanceof Error ? error.message : 'Invalid Docker configuration' }); }
});
app.get('/api/docker/inventory', async (req, res) => {
  const simulate = req.query.simulate !== 'false';
  if (simulate) return res.json(simulatedDockerInventory());
  try {
    const config = dockerConfigFromEnvironment();
    if (!config) return res.status(503).json({ error: 'Docker is not configured. Set DOCKER_SOCKET_PATH.' });
    return res.json(await discoverDocker(config));
  } catch (error) {
    return res.status(502).json({ error: error instanceof Error ? error.message : 'Docker discovery failed' });
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
