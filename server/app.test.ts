import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from './app.js';
import { Store } from './store.js';

describe('application security boundary', () => {
  let server: Server | undefined;
  let store: Store | undefined;

  afterEach(() => {
    server?.close();
    store?.close();
  });

  it('returns a health response with defensive browser and cache headers', async () => {
    store = new Store(':memory:');
    server = createApp(store).listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server?.once('listening', resolve);
      server?.once('error', reject);
    });
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/api/health`);

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'ok', service: 'sentinel-api' });
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(response.headers.get('permissions-policy')).toContain('camera=()');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('x-frame-options')).toBe('DENY');
  });
});
