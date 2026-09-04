import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { authConfigFromEnvironment, type AuthConfig } from './auth.js';
import { StructuredLogger } from './logging/logger.js';
import { Store } from './store.js';
import { SecurityAuditService } from './security/service.js';

const proxySecret = 'stage-13-proxy-secret-with-32-characters';
const config: AuthConfig = { mode: 'proxy', proxySecret, adminGroups: ['admins'], operatorGroups: ['operators'] };

describe('authentication and authorization', () => {
  let server: Server | undefined;
  let store: Store | undefined;

  afterEach(() => { server?.close(); store?.close(); });

  it('rejects proxy mode without a strong shared secret', () => {
    expect(() => authConfigFromEnvironment({ SENTINEL_AUTH_MODE: 'proxy', SENTINEL_AUTH_PROXY_SECRET: 'short' })).toThrow(/at least 32/);
    expect(() => authConfigFromEnvironment({ SENTINEL_AUTH_MODE: 'proxxy' })).toThrow(/disabled or proxy/);
  });

  it('keeps the health check public but rejects an untrusted proxy', async () => {
    const base = await start(config);
    expect((await fetch(`${base}/api/health`)).status).toBe(200);
    expect((await fetch(`${base}/api/tests`)).status).toBe(401);
  });

  it('gives an authenticated user viewer access by default', async () => {
    const base = await start(config);
    const headers = proxyHeaders('brett', 'everyone');
    const session = await fetch(`${base}/api/session`, { headers });
    expect((await session.json()).user.role).toBe('viewer');
    expect((await fetch(`${base}/api/tests`, { headers })).status).toBe(200);
    expect((await fetch(`${base}/api/runs`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: '{"simulate":true}' })).status).toBe(403);
  });

  it('allows operators to run checks and administrators to change configuration', async () => {
    const base = await start(config);
    const operator = proxyHeaders('operator', 'operators');
    expect((await fetch(`${base}/api/runs`, { method: 'POST', headers: { ...operator, 'content-type': 'application/json' }, body: '{"simulate":true}' })).status).toBe(200);
    expect((await fetch(`${base}/api/tests`, { method: 'POST', headers: { ...operator, 'content-type': 'application/json' }, body: '{}' })).status).toBe(403);
    const admin = proxyHeaders('admin', 'admins');
    const response = await fetch(`${base}/api/tests`, { method: 'POST', headers: { ...admin, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Authorized check', kind: 'api', target: 'https://example.test', critical: false, timeoutMs: 1000 }) });
    expect(response.status).toBe(201);
  });

  it('restricts retained security events to administrators', async () => {
    const base = await start(config);
    const viewer = proxyHeaders('viewer', 'everyone');
    expect((await fetch(`${base}/api/security/events`, { headers: viewer })).status).toBe(403);
    const admin = proxyHeaders('admin', 'admins');
    const response = await fetch(`${base}/api/security/events`, { headers: admin });
    expect(response.status).toBe(200);
    expect((await response.json()).summary.denied).toBe(1);
  });

  it('restricts backup controls to administrators', async () => {
    const base = await start(config);
    const viewer = proxyHeaders('viewer', 'everyone');
    expect((await fetch(`${base}/api/backups`, { headers: viewer })).status).toBe(403);
    const admin = proxyHeaders('admin', 'admins');
    expect((await fetch(`${base}/api/backups`, { headers: admin })).status).toBe(503);
  });

  it('allows collector visibility but restricts enrollment to administrators', async () => {
    const base = await start(config);
    const viewer = proxyHeaders('viewer', 'everyone');
    expect((await fetch(`${base}/api/collectors`, { headers: viewer })).status).toBe(503);
    expect((await fetch(`${base}/api/collectors`, { method: 'POST', headers: viewer })).status).toBe(403);
    const admin = proxyHeaders('admin', 'admins');
    expect((await fetch(`${base}/api/collectors`, { method: 'POST', headers: admin })).status).toBe(503);
  });

  async function start(auth: AuthConfig) {
    store = new Store(':memory:');
    server = createApp(store, undefined, undefined, undefined, undefined, undefined, new StructuredLogger(() => {}), auth, new SecurityAuditService({}, false)).listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => { server?.once('listening', resolve); server?.once('error', reject); });
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }
});

function proxyHeaders(user: string, groups: string) {
  return { 'x-sentinel-proxy-secret': proxySecret, 'x-forwarded-user': user, 'x-forwarded-name': user, 'x-forwarded-groups': groups };
}
