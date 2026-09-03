import { describe, expect, it } from 'vitest';
import { NotificationDispatcher } from './notifications.js';
import type { Incident } from './types.js';

const incident: Incident = { id: 'incident-1', ruleId: 'rule-1', monitorId: 'monitor-1', title: 'Service down', summary: 'Two checks failed', severity: 'critical', status: 'open', occurrences: 1, openedAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

describe('notification delivery', () => {
  it('simulates delivery by default without network access', async () => {
    const deliveries = await new NotificationDispatcher({}).send(incident, 'opened');
    expect(deliveries[0]).toMatchObject({ channel: 'simulation', status: 'simulated', event: 'opened' });
  });
  it('validates webhook and SMTP URL protocols', () => {
    expect(() => new NotificationDispatcher({ SENTINEL_WEBHOOK_URL: 'file:///tmp/hook' })).toThrow('HTTP');
    expect(() => new NotificationDispatcher({ SENTINEL_SMTP_URL: 'https://mail.example' })).toThrow('SMTP');
  });
});
