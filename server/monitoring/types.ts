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
export type AlertSeverity = 'warning' | 'critical';
export type AlertRule = {
  id: string;
  name: string;
  monitorId: string;
  failureThreshold: number;
  cooldownSeconds: number;
  severity: AlertSeverity;
  enabled: boolean;
  suppressedUntil?: string;
  createdAt: string;
};
export type Incident = {
  id: string;
  ruleId: string;
  monitorId: string;
  title: string;
  summary: string;
  severity: AlertSeverity;
  status: 'open' | 'acknowledged' | 'resolved';
  occurrences: number;
  openedAt: string;
  updatedAt: string;
  acknowledgedAt?: string;
  resolvedAt?: string;
  lastNotificationAt?: string;
};
export type NotificationDelivery = {
  id: string;
  incidentId: string;
  channel: 'webhook' | 'email' | 'simulation';
  event: 'opened' | 'reminder' | 'resolved';
  status: 'sent' | 'failed' | 'simulated';
  detail: string;
  attemptedAt: string;
};
export type MonitoringData = { monitors: Monitor[]; results: MonitorResult[]; alertRules: AlertRule[]; incidents: Incident[]; deliveries: NotificationDelivery[] };
