import { describe, expect, it, vi } from 'vitest';
import { defaultTests, runTest } from './runner.js';

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
});
