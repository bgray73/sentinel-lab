import { secretFromEnvironment } from '../config/secrets.js';
import type { Incident } from './types.js';

export type JevTriage = {
  category: 'network' | 'compute' | 'storage' | 'application' | 'other';
  confidence: number;
  review: boolean;
  model: string;
  evaluatedAt: string;
};

const categories = ['network', 'compute', 'storage', 'application', 'other'] as const;

export class JevIncidentTriage {
  readonly enabled: boolean;
  private readonly key?: string;
  constructor(env: NodeJS.ProcessEnv = process.env, private readonly fetcher: typeof fetch = fetch) {
    this.enabled = env.SENTINEL_JEV_ENABLED === 'true';
    this.key = this.enabled ? secretFromEnvironment(env, 'SENTINEL_JEV_API_KEY') : undefined;
    if (this.enabled && !this.key) throw new Error('SENTINEL_JEV_API_KEY or SENTINEL_JEV_API_KEY_FILE is required when Jev is enabled');
  }

  async evaluate(incident: Incident): Promise<JevTriage | undefined> {
    if (!this.enabled) return undefined;
    try {
      // Only operational incident fields are shared. No credentials, target URLs or logs.
      const response = await this.fetcher('https://api.typesafe.ai/v1/systemone', {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'jev-latest',
          state: { title: incident.title.slice(0, 200), summary: incident.summary.slice(0, 1000), severity: incident.severity },
          questions: {
            category: {
              type: 'choice', instructions: 'Which infrastructure area best describes the incident?',
              criteria: {
                network: 'Switches, interfaces, routing, or connectivity',
                compute: 'Proxmox hosts, virtual machines, containers, or CPU and memory',
                storage: 'Disks, capacity, backup storage, or PBS',
                application: 'Service or application availability',
                other: 'Unclear, mixed, or outside these areas'
              }
            }
          }
        }),
        signal: AbortSignal.timeout(2500)
      });
      if (!response.ok) return undefined;
      const body = await response.json() as { model?: unknown; answers?: { category?: { type?: unknown; choice?: unknown; confidence?: unknown } } };
      const answer = body.answers?.category;
      if (answer?.type !== 'choice' || !categories.some(value => value === answer.choice) ||
          typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence) ||
          answer.confidence < 0 || answer.confidence > 1 || typeof body.model !== 'string') return undefined;
      return { category: answer.choice as JevTriage['category'], confidence: answer.confidence,
        review: answer.choice === 'other' || answer.confidence < 0.8,
        model: body.model, evaluatedAt: new Date().toISOString() };
    } catch { return undefined; }
  }
}
