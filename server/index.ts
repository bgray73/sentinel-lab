import express from 'express';
import { defaultTests, runTest, type TestCase, type TestResult } from './runner.js';
const app = express(); app.use(express.json());
let tests = [...defaultTests]; let history: { id: string; startedAt: string; duration: number; results: TestResult[] }[] = [];

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'sentinel-api' }));
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
