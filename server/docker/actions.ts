import http from 'node:http';
import type { DockerConfig } from './client.js';

export type DockerAction = 'start' | 'stop' | 'restart';

export function validateDockerAction(action: unknown, containerId: unknown): { action: DockerAction; containerId: string } {
  if (action !== 'start' && action !== 'stop' && action !== 'restart') throw new Error('Invalid Docker action');
  if (typeof containerId !== 'string' || !/^[a-f0-9]{12,64}$/i.test(containerId)) throw new Error('Container ID must be a Docker hexadecimal ID');
  return { action, containerId };
}

export async function executeDockerAction(config: DockerConfig, action: DockerAction, containerId: string): Promise<void> {
  if (!config.socketPath || config.baseUrl) throw new Error('Write operations require a local Docker Unix socket');
  const requestPath = '/containers/' + encodeURIComponent(containerId) + '/' + action + (action === 'stop' ? '?t=10' : '');
  await new Promise<void>((resolve, reject) => {
    const request = http.request({ socketPath: config.socketPath, path: requestPath, method: 'POST', timeout: 15_000 }, response => {
      response.resume();
      response.on('end', () => {
        if (response.statusCode === 204 || response.statusCode === 304) resolve();
        else reject(new Error('Docker API returned HTTP ' + response.statusCode));
      });
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Docker action timed out')));
    request.on('error', reject);
    request.end();
  });
}
