import { describe, expect, it, vi } from 'vitest';
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
  it('routes generic, Slack, and Teams webhook payloads independently', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request, _init?: RequestInit) => new Response('', { status: 202 }));
    const deliveries = await new NotificationDispatcher({ SENTINEL_REAL_NOTIFICATIONS: 'true', SENTINEL_WEBHOOK_URL: 'https://hooks.example/generic', SENTINEL_SLACK_WEBHOOK_URL: 'https://hooks.example/slack', SENTINEL_TEAMS_WEBHOOK_URL: 'https://hooks.example/teams' }, fetcher).send(incident, 'opened');
    expect(deliveries.map(item => item.channel)).toEqual(['webhook', 'slack', 'teams']);
    expect(deliveries.every(item => item.status === 'sent' && item.attempt === 1)).toBe(true);
    expect(JSON.parse(String(fetcher.mock.calls[1][1]?.body))).toMatchObject({ text: expect.stringContaining('Service down') });
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toMatchObject({ type: 'message' });
  });
  it('creates and resolves one correlated ServiceNow incident', async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => init?.method === 'POST' ? Response.json({ result: { sys_id: 'abc123', number: 'INC0012345' } }) : Response.json({ result: { sys_id: 'abc123' } }));
    const dispatcher = new NotificationDispatcher({ SENTINEL_REAL_NOTIFICATIONS: 'true', SENTINEL_SERVICENOW_URL: 'https://example.service-now.com', SENTINEL_SERVICENOW_TOKEN: 'token' }, fetcher);
    expect((await dispatcher.send(incident, 'opened'))[0]).toMatchObject({ channel: 'servicenow', status: 'sent' });
    expect(incident.externalTicket?.number).toBe('INC0012345');
    incident.status = 'resolved'; incident.resolvedAt = new Date().toISOString();
    expect((await dispatcher.send(incident, 'resolved'))[0].detail).toContain('resolved');
    expect(fetcher.mock.calls[1][1]?.method).toBe('PATCH');
  });
});
