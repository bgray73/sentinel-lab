import dns from 'node:dns/promises';
import net from 'node:net';
import type { Monitor, MonitorResult } from './types.js';

function withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([operation, new Promise<T>((_, reject) => setTimeout(() => reject(new Error('Check timed out')), timeoutMs))]);
}

async function httpCheck(monitor: Monitor) {
  const url = new URL(monitor.target);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('HTTP checks require an HTTP(S) URL');
  const response = await fetch(url, { signal: AbortSignal.timeout(monitor.timeoutMs), redirect: 'follow' });
  const expected = monitor.expectedStatus;
  const passed = expected ? response.status === expected : response.status >= 200 && response.status < 400;
  if (!passed) throw new Error(`Expected ${expected || 'HTTP 2xx/3xx'}, received HTTP ${response.status}`);
  return `HTTP ${response.status}`;
}

async function tcpCheck(monitor: Monitor) {
  const url = new URL(`tcp://${monitor.target}`);
  const port = Number(url.port);
  if (!url.hostname || !port || port > 65535) throw new Error('TCP target must use host:port');
  await withTimeout(new Promise<void>((resolve, reject) => {
    const socket = net.createConnection({ host: url.hostname, port });
    socket.once('connect', () => { socket.end(); resolve(); });
    socket.once('error', reject);
  }), monitor.timeoutMs);
  return `TCP ${url.hostname}:${port} accepted a connection`;
}

async function dnsCheck(monitor: Monitor) {
  if (!/^[a-z0-9.-]+$/i.test(monitor.target)) throw new Error('DNS target must be a hostname');
  const result = await withTimeout(dns.lookup(monitor.target), monitor.timeoutMs);
  return `DNS resolved to ${result.address}`;
}

export async function runMonitorCheck(monitor: Monitor, simulate = true, random: () => number = Math.random): Promise<MonitorResult> {
  const started = Date.now();
  try {
    let detail: string;
    if (simulate) {
      await new Promise(resolve => setTimeout(resolve, 20));
      if (random() < 0.08) throw new Error('Simulated availability failure');
      detail = ({ http: 'HTTP 200', tcp: 'TCP connection accepted', dns: 'DNS resolved successfully' })[monitor.protocol];
    } else {
      detail = monitor.protocol === 'http' ? await httpCheck(monitor) : monitor.protocol === 'tcp' ? await tcpCheck(monitor) : await dnsCheck(monitor);
    }
    return { id: `result-${Date.now()}-${Math.random().toString(16).slice(2)}`, monitorId: monitor.id, status: 'up', latencyMs: Date.now() - started, detail, checkedAt: new Date().toISOString() };
  } catch (error) {
    return { id: `result-${Date.now()}-${Math.random().toString(16).slice(2)}`, monitorId: monitor.id, status: 'down', latencyMs: Date.now() - started, detail: error instanceof Error ? error.message : 'Check failed', checkedAt: new Date().toISOString() };
  }
}

export function calculateHealth(results: MonitorResult[], timeoutMs: number) {
  if (!results.length) return { healthScore: null, uptimePercent: null };
  const uptimePercent = Math.round(results.filter(result => result.status === 'up').length / results.length * 10_000) / 100;
  const successful = results.filter(result => result.status === 'up');
  const averageLatency = successful.length ? successful.reduce((total, result) => total + result.latencyMs, 0) / successful.length : timeoutMs;
  const latencyScore = Math.max(0, 100 - (averageLatency / timeoutMs) * 100);
  return { uptimePercent, healthScore: Math.round(uptimePercent * .8 + latencyScore * .2) };
}

