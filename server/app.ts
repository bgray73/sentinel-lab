import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateGate, runTest } from './runner.js';
import { Store } from './store.js';
import { ValidationError, validateRun, validateTest } from './validation.js';
import type { Run, TestResult } from './types.js';

export function createApp(store: Store) {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'sentinel-api' }));
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
