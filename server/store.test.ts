import { describe, expect, it } from 'vitest';
import { evaluateGate } from './runner.js';
import { Store } from './store.js';

describe('SQLite store', () => {
  it('persists custom tests and run history', () => {
    const store = new Store(':memory:');
    const test = store.insertTest({ id: 'custom-test', name: 'Custom API', kind: 'api', target: 'https://example.com/health', critical: true, timeoutMs: 5000 });
    const result = { ...test, status: 'passed' as const, latency: 42, detail: 'HTTP 200 OK', timestamp: new Date().toISOString() };
    store.saveRun({ id: 'run-test', startedAt: new Date().toISOString(), duration: 42, results: [result], gate: evaluateGate([result]) });
    expect(store.listTests()).toContainEqual(test);
    expect(store.listRuns()).toEqual([expect.objectContaining({ id: 'run-test', results: [result], gate: expect.objectContaining({ status: 'ready' }) })]);
    store.close();
  });
});
