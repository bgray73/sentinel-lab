import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { SecurityAuditService } from './service.js';

describe('security audit service', () => {
  let directory = '';
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = ''; });

  it('retains authentication and authorization events across restarts', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sentinel-security-'));
    const env = { SENTINEL_AUTH_AUDIT_FILE: join(directory, 'audit.json'), SENTINEL_AUTH_AUDIT_RETENTION_DAYS: '30', SENTINEL_AUTH_AUDIT_MAX_EVENTS: '100' };
    const first = new SecurityAuditService(env);
    first.record({ type: 'authentication_failed', severity: 'warning', method: 'GET', path: '/api/session', reason: 'untrusted_proxy' });
    first.record({ type: 'authorization_denied', severity: 'warning', subject: 'viewer', role: 'viewer', requiredRole: 'admin', method: 'GET', path: '/api/security/events' });
    expect((await first.snapshot()).summary).toMatchObject({ retained: 2, failures: 1, denied: 1 });

    const restored = new SecurityAuditService(env);
    const snapshot = await restored.snapshot();
    expect(snapshot.events).toHaveLength(2);
    expect(snapshot.retention).toEqual({ days: 30, maxEvents: 100 });
  });

  it('validates retention settings', () => {
    expect(() => new SecurityAuditService({ SENTINEL_AUTH_AUDIT_RETENTION_DAYS: '0' }, false)).toThrow(/integer from 1 to 365/);
    expect(() => new SecurityAuditService({ SENTINEL_AUTH_AUDIT_MAX_EVENTS: '10' }, false)).toThrow(/integer from 100 to 100000/);
  });
});
