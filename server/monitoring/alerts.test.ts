import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonitoringService } from './service.js';

const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))); });

describe('alert and incident lifecycle', () => {
  it('opens, acknowledges, suppresses, and resolves an incident', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sentinel-alerts-')); directories.push(directory);
    const service = new MonitoringService({ SENTINEL_DATA_FILE: path.join(directory, 'data.json') }); await service.ready;
    vi.spyOn(Math, 'random').mockReturnValue(.01);
    await service.run('monitor-web'); await service.run('monitor-web');
    expect(service.incidents('open')).toHaveLength(1);
    const incident = await service.acknowledgeIncident(service.incidents('open')[0].id); expect(incident.status).toBe('acknowledged');
    const rule = await service.suppressAlert('alert-consecutive-failures', 30); expect(rule.suppressedUntil).toBeTruthy();
    vi.spyOn(Math, 'random').mockReturnValue(.9);
    await service.run('monitor-web');
    expect(service.incidents('resolved')).toHaveLength(1);
    expect(service.deliveries().map(delivery => delivery.event)).toEqual(['resolved', 'opened']);
  });

  it('validates new alert rules', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sentinel-alert-validation-')); directories.push(directory);
    const service = new MonitoringService({ SENTINEL_DATA_FILE: path.join(directory, 'data.json') }); await service.ready;
    await expect(service.addAlertRule({ name: 'Bad rule', monitorId: '*', severity: 'critical', failureThreshold: 0, cooldownSeconds: 900 })).rejects.toThrow('threshold');
  });
});
