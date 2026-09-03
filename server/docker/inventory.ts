import type { DockerApiContainer, DockerContainer, DockerHealth, DockerInventory } from './types.js';

function healthFor(container: DockerApiContainer): DockerHealth {
  const status = container.Status.toLowerCase();
  if (status.includes('(unhealthy)') || container.State === 'dead') return 'critical';
  if (container.State !== 'running') return 'warning';
  if (status.includes('(healthy)')) return 'healthy';
  return 'unknown';
}

export function buildDockerInventory(containers: DockerApiContainer[], source: DockerInventory['source'], engineName: string, engineVersion?: string): DockerInventory {
  const normalized: DockerContainer[] = containers.map(container => ({
    id: container.Id,
    name: container.Names?.[0]?.replace(/^\//, '') || container.Id.slice(0, 12),
    image: container.Image,
    state: container.State,
    status: container.Status,
    health: healthFor(container),
    composeProject: container.Labels?.['com.docker.compose.project'],
    composeService: container.Labels?.['com.docker.compose.service'],
    ports: (container.Ports || []).map(port => ({ privatePort: port.PrivatePort, publicPort: port.PublicPort, protocol: port.Type })),
    createdAt: new Date(container.Created * 1000).toISOString()
  }));
  const projects = new Set(normalized.map(container => container.composeProject).filter(Boolean));
  return {
    source,
    collectedAt: new Date().toISOString(),
    engineName,
    engineVersion,
    containers: normalized,
    summary: {
      total: normalized.length,
      running: normalized.filter(container => container.state === 'running').length,
      stopped: normalized.filter(container => container.state !== 'running').length,
      healthy: normalized.filter(container => container.health === 'healthy').length,
      unhealthy: normalized.filter(container => container.health === 'critical').length,
      composeProjects: projects.size
    }
  };
}

export function simulatedDockerInventory() {
  const now = Math.floor(Date.now() / 1000);
  return buildDockerInventory([
    { Id: 'plex00000001', Names: ['/plex'], Image: 'lscr.io/linuxserver/plex:latest', State: 'running', Status: 'Up 3 days (healthy)', Created: now - 259_200, Labels: { 'com.docker.compose.project': 'media', 'com.docker.compose.service': 'plex' }, Ports: [{ PrivatePort: 32400, PublicPort: 32400, Type: 'tcp' }] },
    { Id: 'sonarr000001', Names: ['/sonarr'], Image: 'lscr.io/linuxserver/sonarr:latest', State: 'running', Status: 'Up 3 days (healthy)', Created: now - 259_100, Labels: { 'com.docker.compose.project': 'media', 'com.docker.compose.service': 'sonarr' }, Ports: [{ PrivatePort: 8989, PublicPort: 8989, Type: 'tcp' }] },
    { Id: 'postgres0001', Names: ['/gitlab-postgres'], Image: 'postgres:17', State: 'running', Status: 'Up 8 hours (healthy)', Created: now - 28_800, Labels: { 'com.docker.compose.project': 'gitlab', 'com.docker.compose.service': 'database' }, Ports: [{ PrivatePort: 5432, Type: 'tcp' }] },
    { Id: 'redis0000001', Names: ['/gitlab-redis'], Image: 'redis:8', State: 'running', Status: 'Up 8 hours', Created: now - 28_700, Labels: { 'com.docker.compose.project': 'gitlab', 'com.docker.compose.service': 'cache' }, Ports: [{ PrivatePort: 6379, Type: 'tcp' }] },
    { Id: 'backup000001', Names: ['/backup-job'], Image: 'restic/restic:latest', State: 'exited', Status: 'Exited (0) 2 hours ago', Created: now - 604_800, Labels: { 'com.docker.compose.project': 'backup', 'com.docker.compose.service': 'restic' }, Ports: [] }
  ], 'simulation', 'docker-01', '28.3.0');
}

