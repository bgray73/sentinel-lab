import { resolve } from 'node:path';
import { SecurityAuditStore } from './store.js';
import type { SecurityEvent, SecurityEventInput, SecurityEventType } from './types.js';

export class SecurityAuditService {
  private events: SecurityEvent[] = [];
  private readonly store?: SecurityAuditStore;
  private queue: Promise<void> = Promise.resolve();
  readonly ready: Promise<void>;
  readonly retentionDays: number;
  readonly maxEvents: number;

  constructor(env: NodeJS.ProcessEnv = process.env, persistent = true) {
    this.retentionDays = integer(env.SENTINEL_AUTH_AUDIT_RETENTION_DAYS, 90, 1, 365);
    this.maxEvents = integer(env.SENTINEL_AUTH_AUDIT_MAX_EVENTS, 10_000, 100, 100_000);
    if (persistent) this.store = new SecurityAuditStore(env.SENTINEL_AUTH_AUDIT_FILE || resolve('.sentinel/security-audit.json'));
    this.ready = this.store ? this.store.load().then(data => { this.events = this.prune(data.events); }) : Promise.resolve();
  }

  record(input: SecurityEventInput) {
    const event: SecurityEvent = { ...input, id: `security-${crypto.randomUUID()}`, timestamp: new Date().toISOString() };
    this.queue = this.queue.then(async () => {
      await this.ready;
      this.events = this.prune([event, ...this.events]);
      await this.store?.save({ events: this.events });
    });
    return event;
  }

  async snapshot(limit = 200, type?: SecurityEventType) {
    await this.ready;
    await this.queue;
    const bounded = Math.min(1000, Math.max(1, Math.floor(limit) || 200));
    const events = (type ? this.events.filter(event => event.type === type) : this.events).slice(0, bounded);
    const failures = this.events.filter(event => event.type === 'authentication_failed').length;
    const denied = this.events.filter(event => event.type === 'authorization_denied').length;
    const sessions = this.events.filter(event => event.type === 'session_authenticated').length;
    return { events, summary: { retained: this.events.length, failures, denied, sessions }, retention: { days: this.retentionDays, maxEvents: this.maxEvents } };
  }

  async prometheus() {
    const value = await this.snapshot(1);
    return `# HELP sentinel_security_events_retained Retained security audit events\n# TYPE sentinel_security_events_retained gauge\nsentinel_security_events_retained ${value.summary.retained}\n# HELP sentinel_security_authentication_failures_retained Retained failed authentication events\n# TYPE sentinel_security_authentication_failures_retained gauge\nsentinel_security_authentication_failures_retained ${value.summary.failures}\n# HELP sentinel_security_authorization_denials_retained Retained authorization denial events\n# TYPE sentinel_security_authorization_denials_retained gauge\nsentinel_security_authorization_denials_retained ${value.summary.denied}\n`;
  }

  private prune(events: SecurityEvent[]) {
    const cutoff = Date.now() - this.retentionDays * 86_400_000;
    return events.filter(event => new Date(event.timestamp).getTime() >= cutoff).slice(0, this.maxEvents);
  }
}

function integer(value: string | undefined, fallback: number, minimum: number, maximum: number) {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Security audit setting must be an integer from ${minimum} to ${maximum}`);
  return parsed;
}
