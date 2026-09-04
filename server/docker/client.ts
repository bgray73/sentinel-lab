import http from 'node:http';
import path from 'node:path';
import { buildDockerInventory } from './inventory.js';
import type { DockerApiContainer, DockerApiStats, DockerInventory, DockerResourceStats } from './types.js';

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

export function normalizeDockerStats(containerId:string,stats:DockerApiStats):DockerResourceStats {
  const cpuDelta=(stats.cpu_stats?.cpu_usage?.total_usage||0)-(stats.precpu_stats?.cpu_usage?.total_usage||0);const systemDelta=(stats.cpu_stats?.system_cpu_usage||0)-(stats.precpu_stats?.system_cpu_usage||0);const cpus=stats.cpu_stats?.online_cpus||stats.cpu_stats?.cpu_usage?.percpu_usage?.length||1;
  const cpuPercent=systemDelta>0&&cpuDelta>=0?Math.round((cpuDelta/systemDelta)*cpus*10_000)/100:0;const memoryUsedBytes=Math.max(0,(stats.memory_stats?.usage||0)-(stats.memory_stats?.stats?.cache||0));const networks=Object.values(stats.networks||{});const io=stats.blkio_stats?.io_service_bytes_recursive||[];
  return {containerId,cpuPercent,memoryUsedBytes,memoryLimitBytes:stats.memory_stats?.limit||0,networkRxBytes:networks.reduce((sum,item)=>sum+(item.rx_bytes||0),0),networkTxBytes:networks.reduce((sum,item)=>sum+(item.tx_bytes||0),0),diskReadBytes:io.filter(item=>item.op?.toLowerCase()==='read').reduce((sum,item)=>sum+(item.value||0),0),diskWriteBytes:io.filter(item=>item.op?.toLowerCase()==='write').reduce((sum,item)=>sum+(item.value||0),0)};
}

export async function collectDockerStats(config:DockerConfig,containerIds:string[],requester:typeof socketRequest=socketRequest) {
  return Promise.all(containerIds.map(async id=>normalizeDockerStats(id,await requester<DockerApiStats>(config.socketPath,`/containers/${encodeURIComponent(id)}/stats?stream=false`))));
}
