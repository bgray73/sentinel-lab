import { describe, expect, it, vi } from 'vitest';
import { JevService, jevEvidence } from './jev.js';
import type { Incident, MonitorView } from '../monitoring/types.js';

const incident: Incident = { id: 'secret-id', monitorId: 'private-host', ruleId: 'system-network-interface-abc', title: 'password=secret', summary: 'https://admin:password@private.example 10.0.0.1', status: 'open', severity: 'critical', occurrences: 1, openedAt: '2026-09-27', updatedAt: '2026-09-27' };
const env = { SENTINEL_REAL_JEV: 'true', TYPESAFE_API_KEY: 'test-key' };
const reply = (choice = 'network', confidence: unknown = 0.9) => new Response(JSON.stringify({ answers: { category: { type: 'choice', choice, confidence } } }));

describe('Jev advisory triage', () => {
  it('defaults to simulation with no outbound calls or invented confidence', async () => {
    const fetcher = vi.fn(); const service = new JevService({}, fetcher);
    expect(await service.analyze(incident)).toMatchObject({ mode: 'simulation', category: 'insufficient_evidence', confidence: null });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses an allowlisted payload without free text, identifiers, targets or secrets', () => {
    const monitor = { protocol: 'dns', name: 'secret', target: 'private.example', lastResult: { status: 'down', detail: 'secret' } } as MonitorView;
    expect(jevEvidence(incident, monitor)).toEqual({ source: 'network-interface', severity: 'critical', status: 'open', protocol: 'dns', check: 'down' });
  });
  it('calls the fixed endpoint with timeout and rejects redirects', async () => {
    const fetcher = vi.fn().mockResolvedValue(reply()); const service = new JevService(env, fetcher);
    const original = JSON.stringify(incident);
    expect(await service.analyze(incident)).toMatchObject({ mode: 'live', category: 'network', confidence: 0.9, reviewRequired: true });
    const [url, options] = fetcher.mock.calls[0];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(options.redirect).toBe('error'); expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.body).not.toContain('private'); expect(options.body).not.toContain('password');
    expect(JSON.stringify(incident)).toBe(original);
    await expect(service.analyze(incident)).rejects.toThrow('Wait 30 seconds');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('falls back to insufficient evidence for low confidence', async () => {
    expect(await new JevService(env, vi.fn().mockResolvedValue(reply('network', 0.4))).analyze(incident)).toMatchObject({ category: 'insufficient_evidence' });
  });
  it.each([['restart',0.9],['network',2],['network','0.9']])('rejects invalid provider results %s %s', async (choice, confidence) => {
    await expect(new JevService(env, vi.fn().mockResolvedValue(reply(String(choice),confidence))).analyze(incident)).rejects.toThrow('unavailable');
  });
  it('does not leak provider errors or silently simulate failed live calls', async () => {
    await expect(new JevService(env, vi.fn().mockResolvedValue(new Response('private upstream detail',{status:429}))).analyze(incident)).rejects.toThrow('Jev analysis unavailable. Existing monitoring and incident state are unchanged.');
    await expect(new JevService(env, vi.fn().mockRejectedValue(new Error('test-key'))).analyze(incident)).rejects.toThrow('unavailable');
  });
  it('rejects oversized responses', async () => {
    await expect(new JevService(env, vi.fn().mockResolvedValue(new Response('x'.repeat(33000)))).analyze(incident)).rejects.toThrow('unavailable');
  });
  it('requires a key in live mode and keeps broken secret configuration nonfatal', async () => {
    const fetcher = vi.fn(); const service = new JevService({ SENTINEL_REAL_JEV:'true', TYPESAFE_API_KEY_FILE:'/does-not-exist/jev-key' },fetcher);
    expect(service.status().configured).toBe(false);
    await expect(service.analyze(incident)).rejects.toThrow('not configured'); expect(fetcher).not.toHaveBeenCalled();
  });
  it('does not analyze resolved incidents', async () => {
    await expect(new JevService({}).analyze({...incident,status:'resolved'})).rejects.toThrow('active incident');
  });
});
