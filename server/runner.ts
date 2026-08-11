export type TestKind = 'frontend' | 'api' | 'container' | 'livenx' | 'livewire';
export type TestCase = { id: string; name: string; kind: TestKind; target: string; critical: boolean; timeoutMs: number };
export type TestResult = TestCase & { status: 'passed' | 'failed'; latency: number; detail: string; timestamp: string };

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export async function runTest(test: TestCase, simulate = true): Promise<TestResult> {
  const started = Date.now();
  if (simulate) {
    await wait(250 + Math.random() * 650);
    const failureRate = test.kind === 'livewire' ? 0.18 : test.kind === 'container' ? 0.12 : 0.07;
    const passed = Math.random() > failureRate;
    return { ...test, status: passed ? 'passed' : 'failed', latency: Date.now() - started,
      detail: passed ? successDetail(test.kind) : failureDetail(test.kind), timestamp: new Date().toISOString() };
  }
  if (!['http:', 'https:'].includes(new URL(test.target).protocol)) throw new Error('Only HTTP(S) targets are allowed');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(test.timeoutMs, 30_000));
  try {
    const response = await fetch(test.target, { signal: controller.signal, redirect: 'manual' });
    const passed = response.status >= 200 && response.status < 400;
    return { ...test, status: passed ? 'passed' : 'failed', latency: Date.now() - started,
      detail: `HTTP ${response.status} ${response.statusText || (passed ? 'OK' : 'Failed')}`, timestamp: new Date().toISOString() };
  } finally { clearTimeout(timeout); }
}

function successDetail(kind: TestKind) {
  return ({ frontend: 'Journey completed · 6 assertions', api: 'Schema valid · contract unchanged', container: 'Healthy · restart count 0', livenx: 'API reachable · telemetry current', livewire: 'LiveFlow export active · OTel connected' })[kind];
}
function failureDetail(kind: TestKind) {
  return ({ frontend: 'Dashboard render exceeded 2.5s', api: 'Response schema drift detected', container: 'Healthcheck failed · restart count 3', livenx: 'Telemetry freshness threshold exceeded', livewire: 'LiveFlow export gap detected' })[kind];
}

export const defaultTests: TestCase[] = [
  { id: 'ui-01', name: 'Operations dashboard journey', kind: 'frontend', target: 'https://example.test/dashboard', critical: true, timeoutMs: 10000 },
  { id: 'api-01', name: 'Core API contract', kind: 'api', target: 'https://example.test/api/health', critical: true, timeoutMs: 5000 },
  { id: 'ctr-01', name: 'Service container health', kind: 'container', target: 'http://service:8080/health', critical: true, timeoutMs: 5000 },
  { id: 'nx-01', name: 'LiveNX API & telemetry freshness', kind: 'livenx', target: 'https://livenx.example.test', critical: true, timeoutMs: 10000 },
  { id: 'lw-01', name: 'LiveWire LiveFlow → LiveNX', kind: 'livewire', target: 'https://livewire.example.test', critical: true, timeoutMs: 15000 },
  { id: 'ui-02', name: 'Authentication & session recovery', kind: 'frontend', target: 'https://example.test/login', critical: false, timeoutMs: 10000 },
  { id: 'api-02', name: 'Reports API performance', kind: 'api', target: 'https://example.test/api/reports', critical: false, timeoutMs: 5000 },
  { id: 'ctr-02', name: 'Dependency readiness chain', kind: 'container', target: 'http://service:8080/ready', critical: false, timeoutMs: 8000 }
];
