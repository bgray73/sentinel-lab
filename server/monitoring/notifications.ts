import nodemailer from 'nodemailer';
import { secretFromEnvironment } from '../config/secrets.js';
import type { Incident, NotificationChannel, NotificationDelivery } from './types.js';

type NotificationEvent = NotificationDelivery['event'];
type LiveChannel = Exclude<NotificationChannel, 'simulation'>;

export class NotificationDispatcher {
  private readonly webhookUrl?: string;
  private readonly slackUrl?: string;
  private readonly teamsUrl?: string;
  private readonly smtpUrl?: string;
  private readonly emailTo?: string;
  private readonly emailFrom: string;
  private readonly serviceNowUrl?: string;
  private readonly serviceNowUsername?: string;
  private readonly serviceNowPassword?: string;
  private readonly serviceNowToken?: string;
  private readonly simulate: boolean;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env, private readonly fetcher: typeof fetch = fetch) {
    this.webhookUrl = secretFromEnvironment(env, 'SENTINEL_WEBHOOK_URL');
    this.slackUrl = secretFromEnvironment(env, 'SENTINEL_SLACK_WEBHOOK_URL');
    this.teamsUrl = secretFromEnvironment(env, 'SENTINEL_TEAMS_WEBHOOK_URL');
    this.smtpUrl = secretFromEnvironment(env, 'SENTINEL_SMTP_URL');
    this.emailTo = env.SENTINEL_ALERT_EMAIL_TO;
    this.emailFrom = env.SENTINEL_ALERT_EMAIL_FROM || 'sentinel@localhost';
    this.serviceNowUrl = env.SENTINEL_SERVICENOW_URL?.replace(/\/$/, '');
    this.serviceNowUsername = env.SENTINEL_SERVICENOW_USERNAME;
    this.serviceNowPassword = secretFromEnvironment(env, 'SENTINEL_SERVICENOW_PASSWORD');
    this.serviceNowToken = secretFromEnvironment(env, 'SENTINEL_SERVICENOW_TOKEN');
    this.simulate = env.SENTINEL_REAL_NOTIFICATIONS !== 'true';
    for (const [name, value] of [['SENTINEL_WEBHOOK_URL', this.webhookUrl], ['SENTINEL_SLACK_WEBHOOK_URL', this.slackUrl], ['SENTINEL_TEAMS_WEBHOOK_URL', this.teamsUrl], ['SENTINEL_SERVICENOW_URL', this.serviceNowUrl]] as const) {
      if (value && !['http:', 'https:'].includes(new URL(value).protocol)) throw new Error(`${name} must use HTTP(S)`);
    }
    if (this.smtpUrl && !['smtp:', 'smtps:'].includes(new URL(this.smtpUrl).protocol)) throw new Error('SENTINEL_SMTP_URL must use SMTP or SMTPS');
    if (this.serviceNowUrl && !this.serviceNowToken && !(this.serviceNowUsername && this.serviceNowPassword)) throw new Error('ServiceNow requires a token or username and password');
  }

  status() {
    return {
      mode: this.simulate ? 'simulation' as const : 'live' as const,
      webhookConfigured: Boolean(this.webhookUrl), slackConfigured: Boolean(this.slackUrl), teamsConfigured: Boolean(this.teamsUrl),
      emailConfigured: Boolean(this.smtpUrl && this.emailTo), serviceNowConfigured: Boolean(this.serviceNowUrl && (this.serviceNowToken || (this.serviceNowUsername && this.serviceNowPassword)))
    };
  }

  async send(incident: Incident, event: NotificationEvent, target?: LiveChannel, attempt = 1, retryOf?: string): Promise<NotificationDelivery[]> {
    const attemptedAt = new Date().toISOString();
    if (this.simulate) return [this.delivery(incident.id, 'simulation', event, 'simulated', 'Notification delivery simulated', attemptedAt, attempt, retryOf)];
    const configured: Array<[LiveChannel, boolean]> = [
      ['webhook', Boolean(this.webhookUrl)], ['slack', Boolean(this.slackUrl)], ['teams', Boolean(this.teamsUrl)],
      ['email', Boolean(this.smtpUrl && this.emailTo)], ['servicenow', Boolean(this.status().serviceNowConfigured)]
    ];
    const channels = configured.filter(([channel, enabled]) => enabled && (!target || channel === target)).map(([channel]) => channel);
    if (target && !channels.length) return [this.delivery(incident.id, target, event, 'failed', `${target} is no longer configured`, attemptedAt, attempt, retryOf)];
    return Promise.all(channels.map(channel => this.sendChannel(channel, incident, event, attemptedAt, attempt, retryOf)));
  }

  private async sendChannel(channel: LiveChannel, incident: Incident, event: NotificationEvent, attemptedAt: string, attempt: number, retryOf?: string) {
    try {
      let detail = '';
      if (channel === 'email') detail = await this.sendEmail(incident, event);
      else if (channel === 'servicenow') detail = await this.sendServiceNow(incident, event);
      else {
        const url = channel === 'slack' ? this.slackUrl! : channel === 'teams' ? this.teamsUrl! : this.webhookUrl!;
        const response = await this.fetcher(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(this.webhookBody(channel, incident, event)), signal: AbortSignal.timeout(10_000) });
        if (!response.ok) throw new Error(`${channel} returned HTTP ${response.status}`);
        detail = `${channel} accepted with HTTP ${response.status}`;
      }
      return this.delivery(incident.id, channel, event, 'sent', detail, attemptedAt, attempt, retryOf);
    } catch (error) {
      return this.delivery(incident.id, channel, event, 'failed', error instanceof Error ? error.message : `${channel} delivery failed`, attemptedAt, attempt, retryOf);
    }
  }

  private webhookBody(channel: 'webhook' | 'slack' | 'teams', incident: Incident, event: NotificationEvent) {
    const text = `[Sentinel] ${incident.severity.toUpperCase()} ${event}: ${incident.title}\n${incident.summary}`;
    if (channel === 'slack') return { text };
    if (channel === 'teams') return { type: 'message', attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard', version: '1.4', body: [{ type: 'TextBlock', weight: 'Bolder', text: `[Sentinel] ${incident.title}` }, { type: 'TextBlock', wrap: true, text: `${incident.severity.toUpperCase()} · ${event}\n${incident.summary}` }] } }] };
    return { schemaVersion: 1, source: 'sentinel-lab', event, incident };
  }

  private async sendEmail(incident: Incident, event: NotificationEvent) {
    const transporter = nodemailer.createTransport(this.smtpUrl!);
    const info = await transporter.sendMail({ from: this.emailFrom, to: this.emailTo, subject: `[Sentinel] ${incident.severity.toUpperCase()} ${event}: ${incident.title}`, text: `${incident.title}\n\n${incident.summary}\n\nStatus: ${incident.status}\nOccurrences: ${incident.occurrences}\nUpdated: ${incident.updatedAt}` });
    return `SMTP message ${info.messageId}`;
  }

  private async sendServiceNow(incident: Incident, event: NotificationEvent) {
    const auth = this.serviceNowToken ? `Bearer ${this.serviceNowToken}` : `Basic ${Buffer.from(`${this.serviceNowUsername}:${this.serviceNowPassword}`).toString('base64')}`;
    const headers = { Authorization: auth, Accept: 'application/json', 'Content-Type': 'application/json' };
    if (event === 'opened' || !incident.externalTicket) {
      const response = await this.fetcher(`${this.serviceNowUrl}/api/now/table/incident`, { method: 'POST', headers, body: JSON.stringify({ short_description: `[Sentinel] ${incident.title}`, description: incident.summary, severity: incident.severity, correlation_id: incident.id, category: 'software' }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`ServiceNow returned HTTP ${response.status}`);
      const body = await response.json() as { result?: { sys_id?: string; number?: string } };
      if (!body.result?.sys_id) throw new Error('ServiceNow response did not include sys_id');
      const number = body.result.number || body.result.sys_id;
      incident.externalTicket = { provider: 'servicenow', id: body.result.sys_id, number, url: `${this.serviceNowUrl}/nav_to.do?uri=incident.do?sys_id=${body.result.sys_id}`, updatedAt: new Date().toISOString() };
      return `ServiceNow incident ${number} created`;
    }
    const resolved = event === 'resolved';
    const response = await this.fetcher(`${this.serviceNowUrl}/api/now/table/incident/${encodeURIComponent(incident.externalTicket.id)}`, { method: 'PATCH', headers, body: JSON.stringify(resolved ? { state: '7', close_notes: `Resolved by Sentinel at ${incident.resolvedAt || incident.updatedAt}` } : { work_notes: `Sentinel reminder: ${incident.occurrences} occurrences. ${incident.summary}` }), signal: AbortSignal.timeout(10_000) });
    if (!response.ok) throw new Error(`ServiceNow returned HTTP ${response.status}`);
    incident.externalTicket.updatedAt = new Date().toISOString();
    return `ServiceNow incident ${incident.externalTicket.number} ${resolved ? 'resolved' : 'updated'}`;
  }

  private delivery(incidentId: string, channel: NotificationChannel, event: NotificationEvent, status: NotificationDelivery['status'], detail: string, attemptedAt: string, attempt: number, retryOf?: string): NotificationDelivery {
    return { id: `delivery-${crypto.randomUUID()}`, incidentId, channel, event, status, detail, attemptedAt, attempt, retryOf };
  }
}
