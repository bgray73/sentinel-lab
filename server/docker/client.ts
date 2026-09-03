import http from 'node:http';
import path from 'node:path';
import { buildDockerInventory } from './inventory.js';
import type { DockerApiContainer, DockerInventory } from './types.js';

export type DockerConfig = { socketPath: string };

export function dockerConfigFromEnvironment(env: NodeJS.ProcessEnv = process.env): DockerConfig | null {
  const socketPath = env.DOCKER_SOCKET_PATH;
  if (!socketPath) return null;
  if (!path.isAbsolute(socketPath)) throw new Error('DOCKER_SOCKET_PATH must be an absolute path');
  return { socketPath };
}

function socketRequest<T>(socketPath: string, requestPath: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = http.request({ socketPath, path: requestPath, method: 'GET', headers: { Host: 'localhost' }, timeout: 15_000 }, response => {
      const chunks: Buffer[] = [];
      response.on('data', chunk => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) return reject(new Error(`Docker API returned HTTP ${response.statusCode || 'unknown'}`));
        try { resolve(JSON.parse(body) as T); } catch { reject(new Error('Docker API returned invalid JSON')); }
      });
    });
    request.on('timeout', () => request.destroy(new Error('Docker API request timed out')));
    request.on('error', reject);
    request.end();
  });
}

export async function discoverDocker(config: DockerConfig, requester: typeof socketRequest = socketRequest): Promise<DockerInventory> {
  const [info, containers] = await Promise.all([
    requester<{ Name: string; ServerVersion?: string }>(config.socketPath, '/info'),
    requester<DockerApiContainer[]>(config.socketPath, '/containers/json?all=1')
  ]);
  return buildDockerInventory(containers, 'docker', info.Name || 'Docker Engine', info.ServerVersion);
}

