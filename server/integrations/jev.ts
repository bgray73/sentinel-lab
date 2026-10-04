import { secretFromEnvironment } from '../config/secrets.js';
import type { Incident, MonitorView } from '../monitoring/types.js';
import { dependencyEvidence, type DependencyContext } from './jev-evidence.js';

const categories = ['network', 'storage', 'compute', 'application', 'insufficient_evidence'] as const;
type Category = typeof categories[number];
export type JevResult = { mode: 'simulation' | 'live'; category: Category; confidence: number | null; reviewRequired: true; analyzedAt: string; incidentId: string; dependencies?: ReturnType<typeof dependencyEvidence> };

// Deliberate allowlist: never send names, targets, IDs, titles, summaries,
// credentials, raw logs, or arbitrary user-provided text to the external model.
export function jevEvidence(incident: Incident, monitor?: MonitorView) {
  const source = incident.ruleId.startsWith('system-network-interface-') ? 'network-interface' : incident.ruleId.startsWith('system-capacity-') ? 'capacity' : incident.ruleId.startsWith('system-recovery-') ? 'recovery' : 'service';
  return {
    source,
    severity: incident.severity === 'critical' ? 'critical' : 'warning',
    status: incident.status === 'acknowledged' ? 'acknowledged' : incident.status === 'resolved' ? 'resolved' : 'open',
    protocol: ['http', 'https', 'tcp', 'dns'].includes(monitor?.protocol || '') ? monitor!.protocol : 'unknown',
    check: monitor?.lastResult?.status === 'up' ? 'up' : monitor?.lastResult?.status === 'down' ? 'down' : 'unknown',
  };
}

export class JevService {
  private readonly live: boolean;
  private readonly key: string;
  readonly includeDependencies: boolean;
  private nextRequestAt = 0;
  private busy = false;

  constructor(env: NodeJS.ProcessEnv = process.env, private readonly fetcher: typeof fetch = fetch) {
    this.live = env.SENTINEL_REAL_JEV === 'true';
    this.includeDependencies = env.SENTINEL_JEV_DEPENDENCIES === 'true';
    // An unreadable optional integration secret must not stop monitoring startup.
    try { this.key = this.live ? secretFromEnvironment(env, 'TYPESAFE_API_KEY') || '' : ''; }
    catch { this.key = ''; }
  }

  status() { return { mode: this.live ? 'live' : 'simulation', configured: !this.live || !!this.key, includeDependencies: this.includeDependencies, minimumIntervalSeconds: 30, payload: `Incident source, severity, lifecycle status, protocol, and latest check status.${this.includeDependencies ? ' Mapped dependency types and health counts are also included when current and mode-matched.' : ''} No free text, names, addresses or raw logs.` }; }

  async analyze(incident: Incident, monitor?: MonitorView, context?: DependencyContext): Promise<JevResult> {
    if (incident.status === 'resolved') throw new Error('Select an active incident');
    const dependencies = this.includeDependencies ? dependencyEvidence(incident, context) : undefined;
    const evidence = { ...jevEvidence(incident, monitor), ...(dependencies ? {dependencies} : {}) };
    const base = { incidentId: incident.id, analyzedAt: new Date().toISOString(), reviewRequired: true as const, ...(dependencies ? {dependencies} : {}) };
    if (!this.live) return { ...base, mode: 'simulation', category: 'insufficient_evidence', confidence: null };
    if (!this.key) throw new Error('Jev is enabled but its server-side API key is not configured');
    if (this.busy || Date.now() < this.nextRequestAt) throw new Error('Wait 30 seconds between Jev requests');
    this.busy = true;
    this.nextRequestAt = Date.now() + 30_000;
    try {
      const response = await this.fetcher('https://api.typesafe.ai/v1/systemone', {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'jev-latest', state: JSON.stringify(evidence), questions: {
          category: { type: 'choice', instructions: 'Classify the reported incident domain using only the supplied evidence. Do not infer a root cause from a failed service check. Choose insufficient_evidence if the domain is ambiguous. This is advisory triage, never permission to act.', criteria: {
            network: 'An explicit network-interface condition or clear network evidence',
            storage: 'Explicit storage evidence', compute: 'Explicit CPU or memory evidence',
            application: 'Explicit application-level evidence', insufficient_evidence: 'Missing or ambiguous domain evidence',
          } },
        } }),
      });
      if (!response.ok) throw new Error('provider error');
      // Bound provider output before parsing; never expose provider error bodies.
      const reader = response.body?.getReader();
      if (!reader) throw new Error('missing body');
      let size = 0; const chunks: Uint8Array[] = [];
      try {
        while (true) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > 32_768) { await reader.cancel(); throw new Error('oversized response'); } chunks.push(part.value); }
      } finally { reader.releaseLock(); }
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const answer = body?.answers?.category;
      if (answer?.type !== 'choice' || !categories.includes(answer.choice) || typeof answer.confidence !== 'number' || !Number.isFinite(answer.confidence) || answer.confidence < 0 || answer.confidence > 1) throw new Error('invalid answer');
      return { ...base, mode: 'live', category: answer.confidence < 0.7 ? 'insufficient_evidence' : answer.choice, confidence: answer.confidence };
    } catch { throw new Error('Jev analysis unavailable. Existing monitoring and incident state are unchanged.'); }
    finally { this.busy = false; }
  }
}
