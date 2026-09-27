import { describe, expect, it, vi } from 'vitest';
import { JevIncidentTriage } from './jev.js';
import type { Incident } from './types.js';

const incident: Incident = { id: 'i', ruleId: 'r', monitorId: 'm', title: 'vmbr0 link down',
  summary: 'Node pve-01 lost connectivity', severity: 'critical', status: 'open',
  occurrences: 1, openedAt: '2026-09-27T00:00:00Z', updatedAt: '2026-09-27T00:00:00Z' };

describe('Jev incident triage', () => {
  it('is off by default and requires a key when enabled', async () => {
    const fetcher = vi.fn();
    expect(await new JevIncidentTriage({}, fetcher).evaluate(incident)).toBeUndefined();
    expect(fetcher).not.toHaveBeenCalled();
    expect(() => new JevIncidentTriage({ SENTINEL_JEV_ENABLED: 'true' })).toThrow(/API_KEY/);
  });

  it('stores a high confidence category without changing the incident policy', async () => {
    const fetcher = vi.fn(async () => Response.json({ model: 'jev-1.13.0', answers: {
      category: { type: 'choice', choice: 'network', confidence: .92, probabilities: { network: .96, other: .04 } }
    } }));
    const triage = new JevIncidentTriage({ SENTINEL_JEV_ENABLED: 'true', SENTINEL_JEV_API_KEY: 'test' }, fetcher);
    expect(await triage.evaluate(incident)).toMatchObject({ category: 'network', confidence: .92, review: false });
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(JSON.parse(String(options.body))).toMatchObject({ model: 'jev-latest', state: { title: incident.title, severity: 'critical' } });
  });

  it('flags uncertain results and ignores errors or malformed answers', async () => {
    const env = { SENTINEL_JEV_ENABLED: 'true', SENTINEL_JEV_API_KEY: 'test' };
    const uncertain = new JevIncidentTriage(env, async () => Response.json({ model: 'jev-1.13.0', answers: { category: { type: 'choice', choice: 'storage', confidence: .55 } } }));
    expect((await uncertain.evaluate(incident))?.review).toBe(true);
    const invalid = new JevIncidentTriage(env, async () => Response.json({ model: 'jev', answers: { category: { type: 'choice', choice: 'security', confidence: 1 } } }));
    expect(await invalid.evaluate(incident)).toBeUndefined();
    const failed = new JevIncidentTriage(env, async () => { throw new Error('offline'); });
    expect(await failed.evaluate(incident)).toBeUndefined();
  });
});
