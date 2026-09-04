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
import { buildTopology } from './topology/engine.js';
import type {TelemetryService} from './telemetry/service.js';
import type { CmdbService } from './cmdb/service.js';
import { logger as defaultLogger, requestLogger, type StructuredLogger } from './logging/logger.js';
import type { LokiService } from './logging/service.js';
import type { MonitoringService } from './monitoring/service.js';
import type { HardwareService } from './hardware/service.js';
import type { Run, TestResult } from './types.js';

export function createApp(store: Store, monitoring?: MonitoringService, telemetry?: TelemetryService, cmdb?: CmdbService, logs?: LokiService, hardware?: HardwareService, log: StructuredLogger = defaultLogger) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use(requestLogger(log));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'sentinel-api' }));
  app.get('/api/monitors', async (_req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    await monitoring.ready; return res.json({ mode: monitoring.mode(), monitors: monitoring.list() });
  });
  app.get('/api/monitors/history', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    await monitoring.ready; return res.json(monitoring.history(typeof req.query.monitorId === 'string' ? req.query.monitorId : undefined, Number(req.query.limit || 100)));
  });
  app.get('/api/metrics', async (req,res)=>{
    if(!monitoring)return res.status(503).json({error:'Monitoring service is not available'});
    try{await monitoring.ready;return res.json(monitoring.metrics(typeof req.query.range==='string'?req.query.range:'24h'));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:'Invalid metrics range'});}
  });
  app.put('/api/metrics/settings',async(req,res)=>{
    if(!monitoring)return res.status(503).json({error:'Monitoring service is not available'});
    try{await monitoring.ready;return res.json(await monitoring.updateRetention(req.body||{}));}catch(error){return res.status(400).json({error:error instanceof Error?error.message:'Invalid retention settings'});}
  });
  app.get('/metrics',async(_req,res)=>{
    if(!monitoring)return res.status(503).type('text/plain').send('Monitoring service is not available\n');
    await monitoring.ready;if(telemetry)await telemetry.ready;res.set('Content-Type','text/plain; version=0.0.4; charset=utf-8');return res.send(`${monitoring.prometheus()}${telemetry?.prometheus()||''}`);
  });
  app.get('/api/infrastructure/metrics/status',async(_req,res)=>{if(!telemetry)return res.status(503).json({error:'Telemetry service is not available'});await telemetry.ready;return res.json(telemetry.status())});
  app.get('/api/infrastructure/metrics',async(req,res)=>{if(!telemetry)return res.status(503).json({error:'Telemetry service is not available'});try{await telemetry.ready;return res.json(telemetry.metrics(typeof req.query.range==='string'?req.query.range:'24h'))}catch(error){return res.status(400).json({error:error instanceof Error?error.message:'Invalid telemetry range'})}});
  app.post('/api/infrastructure/metrics/collect',async(_req,res)=>{if(!telemetry)return res.status(503).json({error:'Telemetry service is not available'});try{await telemetry.ready;return res.json(await telemetry.collect())}catch(error){return res.status(502).json({error:error instanceof Error?error.message:'Telemetry collection failed'})}});
  app.get('/api/cmdb/status', async (_req, res) => {
    if (!cmdb) return res.status(503).json({ error: 'CMDB service is not available' });
    await cmdb.ready; return res.json(cmdb.status());
  });
  app.get('/api/cmdb/items', async (req, res) => {
    if (!cmdb) return res.status(503).json({ error: 'CMDB service is not available' });
    await cmdb.ready; return res.json(cmdb.list({ class: typeof req.query.class === 'string' ? req.query.class : undefined, lifecycle: typeof req.query.lifecycle === 'string' ? req.query.lifecycle : undefined, search: typeof req.query.search === 'string' ? req.query.search : undefined }));
  });
  app.get('/api/cmdb/items/:id', async (req, res) => {
    if (!cmdb) return res.status(503).json({ error: 'CMDB service is not available' });
    await cmdb.ready; const item = cmdb.get(req.params.id); if (!item) return res.status(404).json({ error: 'Configuration item not found' });
    return res.json({ item, relationships: cmdb.relationships().filter(relation => relation.fromId === item.id || relation.toId === item.id), changes: cmdb.changes(100, item.id) });
  });
  app.post('/api/cmdb/items', async (req, res) => {
    if (!cmdb) return res.status(503).json({ error: 'CMDB service is not available' });
    try { await cmdb.ready; return res.status(201).json(await cmdb.createItem(req.body || {})); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid configuration item' }); }
  });
  app.patch('/api/cmdb/items/:id', async (req, res) => {
    if (!cmdb) return res.status(503).json({ error: 'CMDB service is not available' });
    try { await cmdb.ready; return res.json(await cmdb.updateItem(req.params.id, req.body || {})); }
    catch (error) { return res.status(error instanceof Error && error.message.includes('not found') ? 404 : 400).json({ error: error instanceof Error ? error.message : 'Invalid configuration item update' }); }
  });
  app.get('/api/cmdb/relationships', async (_req, res) => {
    if (!cmdb) return res.status(503).json({ error: 'CMDB service is not available' });
    await cmdb.ready; return res.json(cmdb.relationships());
  });
  app.post('/api/cmdb/relationships', async (req, res) => {
    if (!cmdb) return res.status(503).json({ error: 'CMDB service is not available' });
    try { await cmdb.ready; return res.status(201).json(await cmdb.addRelationship(req.body || {})); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid CMDB relationship' }); }
  });
  app.get('/api/cmdb/changes', async (req, res) => {
    if (!cmdb) return res.status(503).json({ error: 'CMDB service is not available' });
    await cmdb.ready; return res.json(cmdb.changes(Number(req.query.limit || 100), typeof req.query.ciId === 'string' ? req.query.ciId : undefined));
  });
  app.get('/api/cmdb/snapshot', async (_req, res) => {
    if (!cmdb) return res.status(503).json({ error: 'CMDB service is not available' });
    await cmdb.ready; return res.json({ status: cmdb.status(), items: cmdb.list(), relationships: cmdb.relationships(), changes: cmdb.changes(500) });
  });
  app.post('/api/cmdb/reconcile', async (_req, res) => {
    if (!cmdb) return res.status(503).json({ error: 'CMDB service is not available' });
    try { await cmdb.ready; return res.json(await cmdb.reconcile()); }
    catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'CMDB reconciliation failed' }); }
  });
  app.get('/api/logs/status', (_req, res) => {
    if (!logs) return res.status(503).json({ error: 'Logging service is not available' });
    return res.json(logs.status());
  });
  app.get('/api/hardware/status', async (_req, res) => {
    if (!hardware) return res.status(503).json({ error: 'Hardware service is not available' });
    await hardware.ready; return res.json(hardware.status());
  });
  app.get('/api/hardware/inventory', async (_req, res) => {
    if (!hardware) return res.status(503).json({ error: 'Hardware service is not available' });
    await hardware.ready; return res.json(hardware.inventory());
  });
  app.post('/api/hardware/discover', async (_req, res) => {
    if (!hardware) return res.status(503).json({ error: 'Hardware service is not available' });
    try { await hardware.ready; return res.json(await hardware.refresh()); }
    catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'Hardware discovery failed' }); }
  });
  app.get('/api/logs', async (req, res) => {
    if (!logs) return res.status(503).json({ error: 'Logging service is not available' });
    try { return res.json(await logs.search({ range: typeof req.query.range === 'string' ? req.query.range : undefined, limit: Number(req.query.limit || 200), level: typeof req.query.level === 'string' ? req.query.level : undefined, source: typeof req.query.source === 'string' ? req.query.source : undefined, service: typeof req.query.service === 'string' ? req.query.service : undefined, search: typeof req.query.search === 'string' ? req.query.search : undefined, ciIds: typeof req.query.ciId === 'string' ? [req.query.ciId] : undefined })); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid log query' }); }
  });
  app.get('/api/logs/incidents/:id/correlation', async (req, res) => {
    if (!logs || !monitoring) return res.status(503).json({ error: 'Logging and monitoring services are required' });
    await monitoring.ready; const incident = monitoring.incidents().find(item => item.id === req.params.id); if (!incident) return res.status(404).json({ error: 'Incident not found' });
    const dependencies = monitoring.dependencies().filter(item => item.monitorId === incident.monitorId).map(item => item.resourceId);
    try { const result = await logs.correlate([`service/${incident.monitorId}`,...dependencies], '6h'); return res.json({ incident, relatedConfigurationItems: [`service/${incident.monitorId}`,...dependencies], ...result }); }
    catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'Log correlation failed' }); }
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
  app.get('/api/alerts', async (_req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    await monitoring.ready; return res.json({ rules: monitoring.alertRules(), notifications: monitoring.notificationStatus() });
  });
  app.post('/api/alerts', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    try { await monitoring.ready; return res.status(201).json(await monitoring.addAlertRule(req.body || {})); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid alert rule' }); }
  });
  app.post('/api/alerts/:id/suppress', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    try { await monitoring.ready; return res.json(await monitoring.suppressAlert(req.params.id, Number(req.body?.minutes || 60))); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Unable to suppress alert' }); }
  });
  app.get('/api/incidents', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    await monitoring.ready; return res.json(monitoring.incidents(typeof req.query.status === 'string' ? req.query.status : undefined));
  });
  app.post('/api/incidents/:id/acknowledge', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    try { await monitoring.ready; return res.json(await monitoring.acknowledgeIncident(req.params.id)); }
    catch (error) { return res.status(404).json({ error: error instanceof Error ? error.message : 'Incident not found' }); }
  });
  app.get('/api/notifications', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    await monitoring.ready; return res.json({ status: monitoring.notificationStatus(), deliveries: monitoring.deliveries(Number(req.query.limit || 100)) });
  });
  app.get('/api/topology', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    try {
      await monitoring.ready; const simulate = req.query.simulate !== 'false';
      let proxmox; let docker;
      if (simulate) { proxmox = simulatedInventory(); docker = simulatedDockerInventory(); }
      else {
        const proxmoxConfig = configFromEnvironment(); const dockerConfig = dockerConfigFromEnvironment();
        if (!proxmoxConfig || !dockerConfig) return res.status(503).json({ error: 'Live topology requires both Proxmox and Docker connections' });
        [proxmox, docker] = await Promise.all([discoverProxmox(proxmoxConfig), discoverDocker(dockerConfig)]);
      }
      return res.json(buildTopology(proxmox, docker, monitoring.list(), { incidents: monitoring.incidents(), mappings: monitoring.dependencies() }));
    } catch (error) { return res.status(502).json({ error: error instanceof Error ? error.message : 'Topology discovery failed' }); }
  });
  app.post('/api/topology/mappings', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    try { await monitoring.ready; return res.status(201).json(await monitoring.addDependency(req.body || {})); }
    catch (error) { return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid dependency mapping' }); }
  });
  app.delete('/api/topology/mappings/:id', async (req, res) => {
    if (!monitoring) return res.status(503).json({ error: 'Monitoring service is not available' });
    try { await monitoring.ready; return res.json(await monitoring.removeDependency(req.params.id)); }
    catch (error) { return res.status(404).json({ error: error instanceof Error ? error.message : 'Dependency mapping not found' }); }
  });
  app.get('/api/proxmox/status', (_req, res) => {
    try { res.json({ configured: configFromEnvironment() !== null, simulationAvailable: true }); }
    catch (error) { res.status(400).json({ configured: false, simulationAvailable: true, error: error instanceof Error ? error.message : 'Invalid Proxmox configuration' }); }
  });
  app.get('/api/connections', (_req, res) => {
    const hardwareStatus = hardware?.status();
    const connections = { proxmox: { configured: false }, docker: { configured: false }, redfish: { configured: Boolean(hardwareStatus?.redfishTargets), targets: hardwareStatus?.redfishTargets || 0 }, snmp: { configured: Boolean(hardwareStatus?.snmpTargets), targets: hardwareStatus?.snmpTargets || 0 } };
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
    log.error('unhandled_request_error', { error: error.message });
    return res.status(500).json({ error: 'Internal server error' });
  });
  return app;
}
