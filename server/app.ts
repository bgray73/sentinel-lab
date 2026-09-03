import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateGate, runTest } from './runner.js';
import { Store } from './store.js';
import { ValidationError, validateRun, validateTest } from './validation.js';
import { configFromEnvironment, discoverProxmox } from './proxmox/client.js';
import { simulatedInventory } from './proxmox/inventory.js';
import { discoverDocker, dockerConfigFromEnvironment } from './docker/client.js';
import { simulatedDockerInventory } from './docker/inventory.js';
import type { MonitoringService } from './monitoring/service.js';
import type { Run, TestResult } from './types.js';

export function createApp(store: Store, monitoring?: MonitoringService) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'sentinel-api' }));
  app.get('/api/monitors', async (_req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    await monitoring.ready; return res.json({ mode: monitoring.mode(), monitors: monitoring.list() });
  });
  app.get('/api/monitors/history', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    await monitoring.ready; return res.json(monitoring.history(typeof req.query.monitorId === 'string' ? req.query.monitorId : undefined, Number(req.query.limit || 100)));
  });
  app.post('/api/monitors', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    try { await monitoring.ready; return res.status(201).json(await monitoring.add(req.body || {})); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid monitor' }); }
  });
  app.post('/api/monitors/run-all', async (_req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    await monitoring.ready; return res.json(await monitoring.runAll());
  });
  app.post('/api/monitors/:id/run', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    try { await monitoring.ready; return res.json(await monitoring.run(req.params.id)); }
    catch (error) { return res.status(404).json({ error: error instanceof Error ? error.message : 'Monitor not found' }); }
  });
  app.get('/api/proxmox/status', (_req, res) => {
    try { res.json({ configured: configFromEnvironment() !== null, simulationAvailable: true }); }
    catch (error) { res.status(400).json({ configured: false, simulationAvailable: true, error: error instanceof Error ? error.message : 'Invalid Proxmox configuration' }); }
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
    if (req.query.simulate !== 'false') return res.json(simulatedDockerInventory());
    try { const config = dockerConfigFromEnvironment(); if (!config) return res.status(503).json({ error: 'Docker is not configured. Set DOCKER_SOCKET_PATH.' }); return res.json(await discoverDocker(config)); }
    catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'Docker discovery failed' }); }
  });
  app.get('/api/inventory', async (req, res) => {
    if (req.query.simulate !== 'false') return res.json(simulatedInventory());
    try { const config = configFromEnvironment(); if (!config) return res.status(503).json({ error: 'Proxmox is not configured. Set PVE_URL, PVE_TOKEN_ID, and PVE_TOKEN_SECRET.' }); return res.json(await discoverProxmox(config)); }
    catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'Proxmox discovery failed' }); }
  });
  app.get('/api/tests', (_req, res) => res.json(store.listTests()));
  app.get('/api/runs', (_req, res) => res.json(store.listRuns()));
  app.post('/api/tests', (req, res, next) => {
    try {
      const input = validateTest(req.body);
      const test = store.insertTest({ ...input, id: `custom-${crypto.randomUUID()}` });
      res.status(201).json(test);
    } catch (error) { next(error); }
  });
  app.post('/api/runs', async (req, res, next) => {
    try {
      const tests = store.listTests();
      const request = validateRun(req.body, new Set(tests.map(test => test.id)));
      const selected = request.ids ? tests.filter(test => request.ids?.includes(test.id)) : tests;
      const started = Date.now();
      const results = await Promise.all(selected.map(test => runTest(test, request.simulate).catch((error: Error): TestResult => ({
        ...test, status: 'failed', latency: Date.now() - started, detail: error.message, timestamp: new Date().toISOString()
      }))));
      const run: Run = { id: `run-${crypto.randomUUID()}`, startedAt: new Date(started).toISOString(), duration: Date.now() - started, results, gate: evaluateGate(results) };
      store.saveRun(run);
      res.json(run);
    } catch (error) { next(error); }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));
  const dist = resolve('dist');
  if (existsSync(dist)) {
    app.use(express.static(dist));
    app.use((req, res, next) => req.method === 'GET' && req.accepts('html') ? res.sendFile(resolve(dist, 'index.html')) : next());
  }
  app.use((error: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof ValidationError) return res.status(400).json({ error: error.message });
    console.error(error);
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
