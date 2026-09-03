import path from 'node:path';
import { calculateHealth, runMonitorCheck } from './checks.js';
import { NotificationDispatcher } from './notifications.js';
import { MonitoringStore } from './store.js';
import type { AlertRule, AlertSeverity, DependencyMapping, Incident, Monitor, MonitoringData, MonitorProtocol, MonitorResult, MonitorView, NotificationDelivery } from './types.js';

const defaultMonitors: Monitor[] = [
  { id: 'monitor-web', name: 'Sentinel web interface', protocol: 'http', target: 'https://sentinel.example.test/health', intervalSeconds: 60, timeoutMs: 5000, enabled: true, expectedStatus: 200, createdAt: new Date().toISOString() },
  { id: 'monitor-db', name: 'Application database', protocol: 'tcp', target: 'postgres:5432', intervalSeconds: 60, timeoutMs: 3000, enabled: true, createdAt: new Date().toISOString() },
  { id: 'monitor-dns', name: 'Lab DNS resolution', protocol: 'dns', target: 'proxmox.example.test', intervalSeconds: 120, timeoutMs: 3000, enabled: true, createdAt: new Date().toISOString() }
];
const defaultAlertRule: AlertRule = { id: 'alert-consecutive-failures', name: 'Repeated service failure', monitorId: '*', failureThreshold: 2, cooldownSeconds: 900, severity: 'critical', enabled: true, createdAt: new Date().toISOString() };

export class MonitoringService {
  private data: MonitoringData = { monitors: [], results: [], alertRules: [], incidents: [], deliveries: [], dependencyMappings: [] };
  readonly ready: Promise<void>;
  private readonly simulate: boolean;
  private readonly store: MonitoringStore;
  private readonly notifications: NotificationDispatcher;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.simulate = env.SENTINEL_REAL_CHECKS !== 'true';
    this.store = new MonitoringStore(env.SENTINEL_DATA_FILE || path.resolve('.sentinel/monitoring.json'));
    this.notifications = new NotificationDispatcher(env);
    this.ready = this.initialize();
  }
  private async initialize() {
    this.data = await this.store.load();
    if (!this.data.monitors.length && this.simulate) { this.data.monitors = defaultMonitors; await this.store.save(this.data); }
    if (!this.data.alertRules.length) { this.data.alertRules = [defaultAlertRule]; await this.store.save(this.data); }
    const timer = setInterval(() => void this.runDue(), 10_000); timer.unref();
  }
  mode() { return this.simulate ? 'simulation' : 'live'; }
  list(): MonitorView[] {
    return this.data.monitors.map(monitor => {
      const results = this.data.results.filter(result => result.monitorId === monitor.id).slice(0, 20);
      return { ...monitor, lastResult: results[0], ...calculateHealth(results, monitor.timeoutMs) };
    });
  }
  history(monitorId?: string, limit = 100) { return this.data.results.filter(result => !monitorId || result.monitorId === monitorId).slice(0, Math.min(Math.max(limit, 1), 500)); }
  alertRules() { return this.data.alertRules; }
  incidents(status?: string) { return this.data.incidents.filter(incident => !status || incident.status === status); }
  deliveries(limit = 100) { return this.data.deliveries.slice(0, Math.min(Math.max(limit, 1), 500)); }
  notificationStatus() { return this.notifications.status(); }
  dependencies() { return this.data.dependencyMappings; }
  async addDependency(input: Record<string, unknown>) {
    const monitorId = String(input.monitorId || '').trim(); const resourceId = String(input.resourceId || '').trim();
    if (!this.data.monitors.some(monitor => monitor.id === monitorId)) throw new Error('Selected monitor does not exist');
    if (!resourceId || resourceId.length > 200) throw new Error('Resource ID is required and must be at most 200 characters');
    const existing = this.data.dependencyMappings.find(mapping => mapping.monitorId === monitorId && mapping.resourceId === resourceId); if (existing) return existing;
    const mapping: DependencyMapping = { id: `dependency-${crypto.randomUUID()}`, monitorId, resourceId, createdAt: new Date().toISOString() };
    this.data.dependencyMappings.push(mapping); await this.store.save(this.data); return mapping;
  }
  async removeDependency(id: string) {
    const index = this.data.dependencyMappings.findIndex(mapping => mapping.id === id); if (index < 0) throw new Error('Dependency mapping not found');
    const [removed] = this.data.dependencyMappings.splice(index, 1); await this.store.save(this.data); return removed;
  }
  async add(input: Record<string, unknown>) {
    const protocol = input.protocol as MonitorProtocol;
    if (!['http', 'tcp', 'dns'].includes(protocol)) throw new Error('Protocol must be http, tcp, or dns');
    const name = String(input.name || '').trim(); const target = String(input.target || '').trim();
    if (!name || name.length > 100) throw new Error('Name is required and must be at most 100 characters');
    if (!target || target.length > 500) throw new Error('Target is required and must be at most 500 characters');
    const intervalSeconds = Number(input.intervalSeconds || 60); const timeoutMs = Number(input.timeoutMs || 5000);
    if (!Number.isInteger(intervalSeconds) || intervalSeconds < 30 || intervalSeconds > 86_400) throw new Error('Interval must be between 30 and 86400 seconds');
    if (!Number.isInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 30_000) throw new Error('Timeout must be between 500 and 30000 milliseconds');
    const monitor: Monitor = { id: `monitor-${Date.now()}`, name, protocol, target, intervalSeconds, timeoutMs, enabled: input.enabled !== false, expectedStatus: protocol === 'http' && input.expectedStatus ? Number(input.expectedStatus) : undefined, createdAt: new Date().toISOString() };
    this.data.monitors.push(monitor); await this.store.save(this.data); return monitor;
  }
  async addAlertRule(input: Record<string, unknown>) {
    const name = String(input.name || '').trim(); const monitorId = String(input.monitorId || '*'); const severity = input.severity as AlertSeverity;
    const failureThreshold = Number(input.failureThreshold ?? 2); const cooldownSeconds = Number(input.cooldownSeconds ?? 900);
    if (!name || name.length > 100) throw new Error('Alert name is required and must be at most 100 characters');
    if (monitorId !== '*' && !this.data.monitors.some(monitor => monitor.id === monitorId)) throw new Error('Selected monitor does not exist');
    if (!['warning', 'critical'].includes(severity)) throw new Error('Severity must be warning or critical');
    if (!Number.isInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 10) throw new Error('Failure threshold must be between 1 and 10');
    if (!Number.isInteger(cooldownSeconds) || cooldownSeconds < 60 || cooldownSeconds > 86_400) throw new Error('Cooldown must be between 60 and 86400 seconds');
    const rule: AlertRule = { id: `alert-${crypto.randomUUID()}`, name, monitorId, failureThreshold, cooldownSeconds, severity, enabled: input.enabled !== false, createdAt: new Date().toISOString() };
    this.data.alertRules.push(rule); await this.store.save(this.data); return rule;
  }
  async acknowledgeIncident(id: string) {
    const incident = this.data.incidents.find(item => item.id === id); if (!incident || incident.status === 'resolved') throw new Error('Active incident not found');
    incident.status = 'acknowledged'; incident.acknowledgedAt = new Date().toISOString(); incident.updatedAt = incident.acknowledgedAt; await this.store.save(this.data); return incident;
  }
  async suppressAlert(id: string, minutes: number) {
    const rule = this.data.alertRules.find(item => item.id === id); if (!rule) throw new Error('Alert rule not found');
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10_080) throw new Error('Suppression must be between 1 minute and 7 days');
    rule.suppressedUntil = new Date(Date.now() + minutes * 60_000).toISOString(); await this.store.save(this.data); return rule;
  }
  async run(id: string) {
    const monitor = this.data.monitors.find(item => item.id === id); if (!monitor) throw new Error('Monitor not found');
    const result = await runMonitorCheck(monitor, this.simulate); await this.record(result); return result;
  }
  async runAll() { const results: MonitorResult[] = []; for (const monitor of this.data.monitors.filter(item => item.enabled)) results.push(await this.run(monitor.id)); return results; }
  private async record(result: MonitorResult) { this.data.results.unshift(result); this.data.results = this.data.results.slice(0, 5_000); await this.evaluateAlerts(result); await this.store.save(this.data); }
  private async evaluateAlerts(result: MonitorResult) {
    const active = this.data.incidents.filter(incident => incident.monitorId === result.monitorId && incident.status !== 'resolved');
    if (result.status === 'up') {
      for (const incident of active) { incident.status = 'resolved'; incident.resolvedAt = new Date().toISOString(); incident.updatedAt = incident.resolvedAt; await this.notify(incident, 'resolved'); }
      return;
    }
    const consecutiveFailures = this.data.results.filter(item => item.monitorId === result.monitorId).findIndex(item => item.status === 'up');
    const failureCount = consecutiveFailures === -1 ? this.data.results.filter(item => item.monitorId === result.monitorId).length : consecutiveFailures;
    for (const rule of this.data.alertRules.filter(item => item.enabled && (item.monitorId === '*' || item.monitorId === result.monitorId))) {
      if (rule.suppressedUntil && new Date(rule.suppressedUntil).getTime() > Date.now()) continue;
      if (failureCount < rule.failureThreshold) continue;
      const existing = active.find(incident => incident.ruleId === rule.id);
      if (existing) {
        existing.occurrences += 1; existing.updatedAt = new Date().toISOString();
        const lastNotification = existing.lastNotificationAt ? new Date(existing.lastNotificationAt).getTime() : 0;
        if (Date.now() - lastNotification >= rule.cooldownSeconds * 1000) await this.notify(existing, 'reminder');
      } else {
        const monitor = this.data.monitors.find(item => item.id === result.monitorId);
        const incident: Incident = { id: `incident-${crypto.randomUUID()}`, ruleId: rule.id, monitorId: result.monitorId, title: `${monitor?.name || result.monitorId} is down`, summary: `${failureCount} consecutive checks failed. Latest result: ${result.detail}`, severity: rule.severity, status: 'open', occurrences: 1, openedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
        this.data.incidents.unshift(incident); await this.notify(incident, 'opened');
      }
    }
  }
  private async notify(incident: Incident, event: NotificationDelivery['event']) {
    const deliveries = await this.notifications.send(incident, event); this.data.deliveries.unshift(...deliveries); this.data.deliveries = this.data.deliveries.slice(0, 1_000); incident.lastNotificationAt = new Date().toISOString();
  }
  private async runDue() {
    await this.ready;
    const now = Date.now();
    for (const monitor of this.data.monitors.filter(item => item.enabled)) {
      const last = this.data.results.find(result => result.monitorId === monitor.id);
      if (!last || now - new Date(last.checkedAt).getTime() >= monitor.intervalSeconds * 1000) await this.run(monitor.id);
    }
  }
}
