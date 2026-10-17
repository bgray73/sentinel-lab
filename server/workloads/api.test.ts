import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { Store } from '../store.js';

describe('workload inventory API', () => {
  let server: Server | undefined;
  let store: Store | undefined;
  afterEach(() => { server?.close(); store?.close(); });
  it('serves a normalized simulated inventory with no-store cache policy', async () => {
    store = new Store(':memory:');
    server = createApp(store).listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server?.once('listening', resolve);
      server?.once('error', reject);
    });
    const port = (server.address() as AddressInfo).port;
    const response = await fetch('http://127.0.0.1:' + port + '/api/workloads');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    const body = await response.json();
    expect(body.summary.total).toBe(body.workloads.length);
    expect(body.workloads.every((workload: { simulated: boolean }) => workload.simulated)).toBe(true);
    expect(body.workloads.some((workload: { kind: string }) => workload.kind === 'docker')).toBe(true);
  });
});
