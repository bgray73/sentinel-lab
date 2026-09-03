export const testKinds = ['frontend', 'api', 'container', 'livenx', 'livewire'] as const;
export type TestKind = (typeof testKinds)[number];
export type TestCase = { id: string; name: string; kind: TestKind; target: string; critical: boolean; timeoutMs: number };
export type TestResult = TestCase & { status: 'passed' | 'failed'; latency: number; detail: string; timestamp: string };
export type Gate = { status: 'ready' | 'blocked'; score: number; passed: number; total: number; criticalFailures: number; minScore: number };
export type Run = { id: string; startedAt: string; duration: number; results: TestResult[]; gate: Gate };
