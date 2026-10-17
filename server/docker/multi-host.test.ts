import { describe, expect, it, vi } from 'vitest';
import { collectDockerTargets, dockerTargetsFromEnvironment } from './multi-host.js';
import type { DockerInventory } from './types.js';

describe('Docker multi-host discovery', () => {
  it('loads distinct HTTPS targets', () => {
    const targets = dockerTargetsFromEnvironment({ DOCKER_HOSTS_JSON: JSON.stringify([
      { id: 'ai01', baseUrl: 'https://docker-ai.example:2376' },
      { id: 'apps', baseUrl: 'https://docker-apps.example:2376' }
    ]) });
    expect(targets.map(t => t.id)).toEqual(['ai01', 'apps']);
  });
  it('rejects plaintext and duplicate targets', () => {
    expect(() => dockerTargetsFromEnvironment({ DOCKER_HOSTS_JSON: '[{"id":"ai","baseUrl":"http://localhost:2375"}]' })).toThrow();
    expect(() => dockerTargetsFromEnvironment({ DOCKER_HOSTS_JSON: '[{"id":"x","baseUrl":"https://one.example"},{"id":"x","baseUrl":"https://two.example"}]' })).toThrow();
  });
  it('reports failures without dropping successful hosts', async () => {
    const inventory = { source: 'docker', engineName: 'host-a', containers: [] } as unknown as DockerInventory;
    const discover = vi.fn().mockResolvedValueOnce(inventory).mockRejectedValueOnce(new Error('offline'));
    const result = await collectDockerTargets([
      { id: 'a', config: { baseUrl: 'https://a.example' } },
      { id: 'b', config: { baseUrl: 'https://b.example' } }
    ], discover);
    expect(result.results).toHaveLength(1);
    expect(result.errors).toEqual([{ id: 'b', error: 'offline' }]);
  });
});
