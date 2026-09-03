export type MonitorProtocol = 'http' | 'tcp' | 'dns';
export type Monitor = {
  id: string;
  name: string;
  protocol: MonitorProtocol;
  target: string;
  intervalSeconds: number;
  timeoutMs: number;
  enabled: boolean;
  expectedStatus?: number;
  createdAt: string;
};
export type MonitorResult = {
  id: string;
  monitorId: string;
  status: 'up' | 'down';
  latencyMs: number;
  detail: string;
  checkedAt: string;
};
export type MonitorView = Monitor & { lastResult?: MonitorResult; healthScore: number | null; uptimePercent: number | null };
export type MonitoringData = { monitors: Monitor[]; results: MonitorResult[] };

