import { describe, expect, it, vi } from 'vitest';
import { calculateHealth, runMonitorCheck } from './checks.js';
import type { Monitor } from './types.js';

const monitor: Monitor = { id: 'one', name: 'Web', protocol: 'http', target: 'https://example.test', intervalSeconds: 60, timeoutMs: 5000, enabled: true, createdAt: '2026-01-01T00:00:00Z' };

describe('service monitoring', () => {
  it('runs a successful simulated check', async () => {
    const result = await runMonitorCheck(monitor, true, () => .9);
    expect(result.status).toBe('up'); expect(result.detail).toBe('HTTP 200');
  });
  it('captures failures as results instead of throwing', async () => {
    const result = await runMonitorCheck(monitor, true, () => .01);
    expect(result.status).toBe('down'); expect(result.detail).toContain('Simulated');
  });
  it('calculates uptime and a bounded health score', () => {
    const results = [
      { id: 'a', monitorId: 'one', status: 'up' as const, latencyMs: 100, detail: 'ok', checkedAt: '2026-01-01T00:00:00Z' },
      { id: 'b', monitorId: 'one', status: 'down' as const, latencyMs: 5000, detail: 'fail', checkedAt: '2026-01-01T00:01:00Z' }
    ];
    expect(calculateHealth(results, 5000)).toEqual({ uptimePercent: 50, healthScore: 60 });
  });
  it('rejects invalid real HTTP protocols', async () => {
    const result = await runMonitorCheck({ ...monitor, target: 'file:///etc/passwd' }, false);
    expect(result.status).toBe('down');
  });
});

