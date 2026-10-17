import { dockerConfigFromEnvironment, discoverDocker, type DockerConfig } from './client.js';
import type { DockerInventory } from './types.js';

export type DockerTarget = { id: string; config: DockerConfig };
export type DockerTargetResult = { id: string; inventory: DockerInventory };
export type DockerCollection = { results: DockerTargetResult[]; errors: Array<{ id: string; error: string }> };

export function dockerTargetsFromEnvironment(env: NodeJS.ProcessEnv = process.env): DockerTarget[] {
  const targets: DockerTarget[] = [];
  const primary = dockerConfigFromEnvironment(env);
  if (primary) targets.push({ id: 'primary', config: primary });
  const raw = env.DOCKER_HOSTS_JSON;
  if (!raw) return targets;
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error('DOCKER_HOSTS_JSON must be an array');
  const ids = new Set(targets.map(target => target.id));
  for (const item of parsed) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('Invalid Docker target');
    const candidate = item as Record<string, unknown>;
    if (typeof candidate.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(candidate.id) || ids.has(candidate.id)) throw new Error('Docker target IDs must be unique and alphanumeric');
    if (typeof candidate.baseUrl !== 'string') throw new Error('Docker target requires baseUrl');
    const parsedUrl = new URL(candidate.baseUrl);
    if (parsedUrl.protocol !== 'https:' || parsedUrl.username || parsedUrl.password || parsedUrl.pathname !== '/' || parsedUrl.search || parsedUrl.hash) throw new Error('Remote Docker targets require HTTPS origins without credentials or paths');
    ids.add(candidate.id);
    targets.push({ id: candidate.id, config: { baseUrl: parsedUrl.origin } });
  }
  return targets;
}

export async function collectDockerTargets(targets: DockerTarget[], discover: typeof discoverDocker = discoverDocker): Promise<DockerCollection> {
  const settled = await Promise.allSettled(targets.map(target => discover(target.config)));
  const results: DockerTargetResult[] = [];
  const errors: DockerCollection['errors'] = [];
  settled.forEach((outcome, index) => {
    const id = targets[index].id;
    if (outcome.status === 'fulfilled') results.push({ id, inventory: outcome.value });
    else errors.push({ id, error: outcome.reason instanceof Error ? outcome.reason.message : 'Docker discovery failed' });
  });
  return { results, errors };
}
