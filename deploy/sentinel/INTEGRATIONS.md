# Sentinel integrations and automation

## Delivery routes

Set `SENTINEL_REAL_NOTIFICATIONS=true`, then configure any combination of these routes:

| Route | Required settings |
| --- | --- |
| Generic JSON webhook | `SENTINEL_WEBHOOK_URL` |
| Slack incoming webhook | `SENTINEL_SLACK_WEBHOOK_URL` |
| Microsoft Teams workflow webhook | `SENTINEL_TEAMS_WEBHOOK_URL` |
| SMTP email | `SENTINEL_SMTP_URL`, `SENTINEL_ALERT_EMAIL_TO` |
| ServiceNow incident | `SENTINEL_SERVICENOW_URL` and either `SENTINEL_SERVICENOW_TOKEN` or username/password |

Open, reminder, and resolved events are routed independently. The **Automation** page shows every attempt and lets an operator retry a failed route without re-sending successful routes.

ServiceNow delivery creates one incident with Sentinel's incident ID as the correlation ID. Reminders append work notes and recovery closes the same record. Use a dedicated integration account limited to the Incident Table API.

## Secret files

Sensitive Sentinel settings accept a matching `_FILE` variable. For example, mount a Docker secret at `/run/secrets/slack_webhook` and set `SENTINEL_SLACK_WEBHOOK_URL_FILE=/run/secrets/slack_webhook`. A direct value takes precedence when both are present.

Secret-file support covers the webhook URLs, SMTP URL, ServiceNow password/token, Proxmox token secret, proxy secret, metrics token, and LabOps export token. Keep secret mounts read-only and never commit their contents.

## External backup replication

The primary recovery point remains local for fast restore. Set `SENTINEL_BACKUP_REPLICA_DIR` to a separately mounted NAS, removable disk, or protected filesystem. After every primary backup passes SHA-256 verification, Sentinel copies it to a temporary replica directory, atomically publishes it, and verifies every replicated checksum.

Use `docker-compose.backup-target.yml.example` as an additional Compose file. The Recovery page distinguishes primary verification from replica verification and can retry a failed or missing copy. A replica protects against host loss only when the underlying storage is physically or administratively separate.
