import { describe, expect, it } from 'vitest';
import { validateRun, validateTest } from './validation.js';

describe('request validation', () => {
  it('accepts a valid test', () => {
    expect(validateTest({ name: 'Health', kind: 'api', target: 'https://example.com/health', critical: true, timeoutMs: 5000 })).toMatchObject({ name: 'Health', kind: 'api' });
  });

  it('rejects invalid targets and timeouts', () => {
    expect(() => validateTest({ name: 'Bad', kind: 'api', target: 'file:///etc/passwd', critical: true, timeoutMs: 0 })).toThrow();
  });

  it('rejects unknown selected tests', () => {
    expect(() => validateRun({ ids: ['missing'] }, new Set(['known']))).toThrow('Unknown test IDs');
  });
});
