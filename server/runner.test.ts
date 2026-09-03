import { describe, expect, it, vi } from 'vitest';
import { defaultTests, evaluateGate, runTest } from './runner.js';

describe('durability runner', () => {
  it('returns a complete result in safe simulation mode', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const result = await runTest(defaultTests[0], true);
    expect(result.status).toBe('passed');
    expect(result.detail).toContain('assertions');
    expect(result.timestamp).toBeTruthy();
  });

  it('rejects non-http targets in real mode', async () => {
    await expect(runTest({ ...defaultTests[0], target: 'file:///etc/passwd' }, false)).rejects.toThrow('Only HTTP(S)');
  });

  it('blocks a release when a critical check fails', () => {
    const results = defaultTests.slice(0, 2).map((test, index) => ({ ...test, status: index ? 'passed' as const : 'failed' as const, latency: 100, detail: 'test', timestamp: new Date().toISOString() }));
    expect(evaluateGate(results)).toMatchObject({ status: 'blocked', score: 50, criticalFailures: 1 });
  });

  it('allows advisory failures when the score remains above the threshold', () => {
    const results = Array.from({ length: 10 }, (_, index) => ({ ...defaultTests[index % defaultTests.length], critical: false, status: index === 0 ? 'failed' as const : 'passed' as const, latency: 100, detail: 'test', timestamp: new Date().toISOString() }));
    expect(evaluateGate(results)).toMatchObject({ status: 'ready', score: 90, criticalFailures: 0 });
  });
});
