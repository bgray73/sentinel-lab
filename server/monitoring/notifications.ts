import nodemailer from 'nodemailer';
import type { Incident, NotificationDelivery } from './types.js';

type NotificationEvent = NotificationDelivery['event'];

export class NotificationDispatcher {
  private readonly webhookUrl?: string;
  private readonly smtpUrl?: string;
  private readonly emailTo?: string;
  private readonly emailFrom: string;
  private readonly simulate: boolean;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.webhookUrl = env.SENTINEL_WEBHOOK_URL;
    this.smtpUrl = env.SENTINEL_SMTP_URL;
    this.emailTo = env.SENTINEL_ALERT_EMAIL_TO;
    this.emailFrom = env.SENTINEL_ALERT_EMAIL_FROM || 'sentinel@localhost';
    this.simulate = env.SENTINEL_REAL_NOTIFICATIONS !== 'true';
    if (this.webhookUrl && !['http:', 'https:'].includes(new URL(this.webhookUrl).protocol)) throw new Error('SENTINEL_WEBHOOK_URL must use HTTP(S)');
    if (this.smtpUrl && !['smtp:', 'smtps:'].includes(new URL(this.smtpUrl).protocol)) throw new Error('SENTINEL_SMTP_URL must use SMTP or SMTPS');
  }
  status() { return { mode: this.simulate ? 'simulation' : 'live', webhookConfigured: Boolean(this.webhookUrl), emailConfigured: Boolean(this.smtpUrl && this.emailTo) }; }
  async send(incident: Incident, event: NotificationEvent): Promise<NotificationDelivery[]> {
    const attemptedAt = new Date().toISOString();
    if (this.simulate) return [{ id: `delivery-${crypto.randomUUID()}`, incidentId: incident.id, channel: 'simulation', event, status: 'simulated', detail: 'Notification delivery simulated', attemptedAt }];
    const deliveries: NotificationDelivery[] = [];
    if (this.webhookUrl) deliveries.push(await this.sendWebhook(incident, event, attemptedAt));
    if (this.smtpUrl && this.emailTo) deliveries.push(await this.sendEmail(incident, event, attemptedAt));
    return deliveries;
  }
  private async sendWebhook(incident: Incident, event: NotificationEvent, attemptedAt: string): Promise<NotificationDelivery> {
    try {
      const response = await fetch(this.webhookUrl!, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event, incident }), signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error(`Webhook returned HTTP ${response.status}`);
      return this.delivery(incident.id, 'webhook', event, 'sent', `Webhook accepted with HTTP ${response.status}`, attemptedAt);
    } catch (error) { return this.delivery(incident.id, 'webhook', event, 'failed', error instanceof Error ? error.message : 'Webhook delivery failed', attemptedAt); }
  }
  private async sendEmail(incident: Incident, event: NotificationEvent, attemptedAt: string): Promise<NotificationDelivery> {
    try {
      const transporter = nodemailer.createTransport(this.smtpUrl!);
      const info = await transporter.sendMail({ from: this.emailFrom, to: this.emailTo, subject: `[Sentinel] ${incident.severity.toUpperCase()} ${event}: ${incident.title}`, text: `${incident.title}\n\n${incident.summary}\n\nStatus: ${incident.status}\nOccurrences: ${incident.occurrences}\nUpdated: ${incident.updatedAt}` });
      return this.delivery(incident.id, 'email', event, 'sent', `SMTP message ${info.messageId}`, attemptedAt);
    } catch (error) { return this.delivery(incident.id, 'email', event, 'failed', error instanceof Error ? error.message : 'Email delivery failed', attemptedAt); }
  }
  private delivery(incidentId: string, channel: NotificationDelivery['channel'], event: NotificationEvent, status: NotificationDelivery['status'], detail: string, attemptedAt: string): NotificationDelivery {
    return { id: `delivery-${crypto.randomUUID()}`, incidentId, channel, event, status, detail, attemptedAt };
  }
}

