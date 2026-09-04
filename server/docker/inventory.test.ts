import { describe, expect, it, vi } from 'vitest';
import { discoverDocker, dockerConfigFromEnvironment } from './client.js';
import { buildDockerInventory, simulatedDockerInventory } from './inventory.js';

describe('Docker inventory', () => {
  it('normalizes Compose metadata, health, ports, and summary totals', () => {
    const inventory = buildDockerInventory([{ Id: '1234567890123', Names: ['/app'], Image: 'app:1', State: 'running', Status: 'Up 1 hour (healthy)', Created: 1, Labels: { 'com.docker.compose.project': 'stack', 'com.docker.compose.service': 'web' }, Ports: [{ PrivatePort: 8080, PublicPort: 80, Type: 'tcp' }] }], 'docker', 'engine');
    expect(inventory.summary).toMatchObject({ total: 1, running: 1, healthy: 1, composeProjects: 1 });
    expect(inventory.containers[0]).toMatchObject({ name: 'app', composeProject: 'stack', composeService: 'web', health: 'healthy' });
  });

  it('requires an explicitly configured absolute socket path', () => {
    expect(dockerConfigFromEnvironment({})).toBeNull();
    expect(() => dockerConfigFromEnvironment({ DOCKER_SOCKET_PATH: 'docker.sock' })).toThrow('absolute path');
    expect(dockerConfigFromEnvironment({DOCKER_HOST_URL:'http://docker-socket-proxy:2375'})).toEqual({baseUrl:'http://docker-socket-proxy:2375'});
    expect(()=>dockerConfigFromEnvironment({DOCKER_HOST_URL:'http://user:pass@proxy:2375'})).toThrow(/without credentials/);
  });

  it('provides a safe simulated application inventory', () => {
    const inventory = simulatedDockerInventory();
    expect(inventory.source).toBe('simulation');
    expect(inventory.summary.composeProjects).toBe(3);
  });

  it('discovers engine information and containers through read-only requests', async () => {
    const requester = vi.fn()
      .mockResolvedValueOnce({ Name: 'docker-01', ServerVersion: '28.3.0' })
      .mockResolvedValueOnce([]);
    const inventory = await discoverDocker({ socketPath: '/var/run/docker.sock' }, requester);
    expect(inventory.engineName).toBe('docker-01');
    expect(requester.mock.calls.map(call => call[1])).toEqual(['/info', '/containers/json?all=1']);
  });
});
