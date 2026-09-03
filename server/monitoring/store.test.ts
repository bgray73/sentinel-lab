import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MonitoringStore } from './store.js';

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('monitoring persistence', () => {
  it('atomically saves and restores monitors and history with private permissions', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sentinel-monitoring-')); directories.push(directory);
    const file = path.join(directory, 'monitoring.json'); const store = new MonitoringStore(file);
    const data = { monitors: [], results: [{ id: 'result-1', monitorId: 'monitor-1', status: 'up' as const, latencyMs: 10, detail: 'ok', checkedAt: '2026-01-01T00:00:00Z' }], alertRules: [], incidents: [], deliveries: [], dependencyMappings: [] };
    await store.save(data);
    expect(await store.load()).toEqual(data);
    expect(JSON.parse(await readFile(file, 'utf8')).results).toHaveLength(1);
  });
});
