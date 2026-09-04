import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { secretFromEnvironment } from './secrets.js';

describe('secret file loading', () => {
  let directory = '';
  afterEach(() => { if (directory) rmSync(directory, { recursive: true, force: true }); directory = ''; });

  it('prefers a direct value and trims only trailing line endings from a file', () => {
    directory = mkdtempSync(join(tmpdir(), 'sentinel-secrets-'));
    const file = join(directory, 'token'); writeFileSync(file, 'from-file\n');
    expect(secretFromEnvironment({ TOKEN: 'direct', TOKEN_FILE: file }, 'TOKEN')).toBe('direct');
    expect(secretFromEnvironment({ TOKEN_FILE: file }, 'TOKEN')).toBe('from-file');
  });

  it('rejects empty secret files', () => {
    directory = mkdtempSync(join(tmpdir(), 'sentinel-secrets-'));
    const file = join(directory, 'token'); writeFileSync(file, '\n');
    expect(() => secretFromEnvironment({ TOKEN_FILE: file }, 'TOKEN')).toThrow(/empty/);
  });
});
