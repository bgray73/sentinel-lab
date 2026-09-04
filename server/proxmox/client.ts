import { buildInventory } from './inventory.js';
import type { ProxmoxApiResource, ProxmoxInventory } from './types.js';
import { secretFromEnvironment } from '../config/secrets.js';

export type ProxmoxConfig = {
  baseUrl: string;
  tokenId: string;
  tokenSecret: string;
};

export function configFromEnvironment(env: NodeJS.ProcessEnv = process.env): ProxmoxConfig | null {
  const baseUrl = env.PVE_URL?.replace(/\/$/, '');
  const tokenId = env.PVE_TOKEN_ID;
  const tokenSecret = secretFromEnvironment(env, 'PVE_TOKEN_SECRET');
  if (!baseUrl || !tokenId || !tokenSecret) return null;
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' && env.PVE_ALLOW_HTTP !== 'true') throw new Error('PVE_URL must use HTTPS unless PVE_ALLOW_HTTP=true');
  return { baseUrl, tokenId, tokenSecret };
}

async function request<T>(config: ProxmoxConfig, path: string, fetcher: typeof fetch): Promise<T> {
  const response = await fetcher(`${config.baseUrl}/api2/json${path}`, {
    headers: { Authorization: `PVEAPIToken=${config.tokenId}=${config.tokenSecret}` },
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Proxmox API returned HTTP ${response.status}`);
  const body = await response.json() as { data: T };
  return body.data;
}

export async function discoverProxmox(config: ProxmoxConfig, fetcher: typeof fetch = fetch): Promise<ProxmoxInventory> {
  const [resources, clusterStatus] = await Promise.all([
    request<ProxmoxApiResource[]>(config, '/cluster/resources', fetcher),
    request<Array<{ type: string; name?: string }>>(config, '/cluster/status', fetcher)
  ]);
  const clusterName = clusterStatus.find(item => item.type === 'cluster')?.name || 'Proxmox cluster';
  return buildInventory(resources, 'proxmox', clusterName);
}
