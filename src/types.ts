export type Kind = 'frontend' | 'api' | 'container' | 'livenx' | 'livewire';
export type Test = { id: string; name: string; kind: Kind; target: string; critical: boolean; timeoutMs: number };
export type Result = Test & { status: 'passed' | 'failed'; latency: number; detail: string; timestamp: string };
export type Gate = { status: 'ready' | 'blocked'; score: number; passed: number; total: number; criticalFailures: number; minScore: number };
export type Run = { id: string; startedAt: string; duration: number; results: Result[]; gate: Gate };
