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

## ServiceNow CMDB and change management

Stage 18 sends discovered Sentinel configuration items through the ServiceNow Identification and Reconciliation Engine (IRE). This preserves ServiceNow identification and reconciliation rules instead of writing directly to CMDB tables. Sentinel uses `source:externalId` as the stable native key, records returned `sys_id` mappings locally, and submits supported CI relationships when both endpoints are in the same batch.

Start with the safe defaults:

```dotenv
SENTINEL_REAL_SERVICENOW_CMDB=false
SENTINEL_SERVICENOW_CMDB_SOURCE=Other Automated
SENTINEL_SERVICENOW_CMDB_FEED=SentinelLab
SENTINEL_SERVICENOW_CMDB_INTERVAL_MINUTES=60
SENTINEL_SERVICENOW_AUTO_CHANGE=false
```

Open **Automation** and select **Preview sync**. The preview records the proposed scope and class mappings locally but does not contact ServiceNow. Check CI counts and relationships, then confirm these prerequisites in ServiceNow:

1. `SENTINEL_SERVICENOW_CMDB_SOURCE` is an allowed `discovery_source` choice. Use an organization-specific value when available.
2. The integration account can call the Identification and Reconciliation API and write the target CMDB classes.
3. Relationship types used by Sentinel exist in `cmdb_rel_type`: Contains, Hosts, Runs on, Depends on, Monitors, and Connects to.
4. The account can create `change_request` records if planned-change automation will be used.

Sentinel maps infrastructure to standard ServiceNow classes:

| Sentinel CI | ServiceNow class |
| --- | --- |
| Proxmox node, Docker host, physical server | `cmdb_ci_server` |
| Virtual machine | `cmdb_ci_vm_instance` |
| LXC or Docker container | `cmdb_ci_container` |
| Application | `cmdb_ci_appl` |
| Service | `cmdb_ci_service` |
| Database | `cmdb_ci_database` |
| Switch / router | `cmdb_ci_ip_switch` / `cmdb_ci_ip_router` |
| Storage | `cmdb_ci_storage_device` |
| Other, UPS, or PDU | `cmdb_ci` |

After validating the preview and ServiceNow rules, set `SENTINEL_REAL_SERVICENOW_CMDB=true` and restart Sentinel. An operator can run an immediate sync; Sentinel also runs it at the configured interval. Batches contain at most 500 CIs. Relationships that cross a batch boundary are reported as deferred so they are visible rather than silently lost.

The **Planned change** action creates a normal ServiceNow change linked to the selected CI. Live change creation requires that CI to have a successful `sys_id` mapping. Leave `SENTINEL_SERVICENOW_AUTO_CHANGE=false` until the workflow is accepted; enabling it creates a corresponding change when an operator schedules a hardware maintenance window. A local maintenance window still succeeds if external change creation fails, and the API reports the automation error.

The state file `/var/lib/sentinel/servicenow-cmdb.json` retains mappings, sync runs, and change records with owner-only permissions and is included in Sentinel recovery points. Prometheus exposes mapping count, latest-sync success, failed-item count, and retained changes by status.

### API endpoints

- `GET /api/integrations/servicenow/cmdb` returns mode, settings without secrets, mappings, sync history, and changes.
- `POST /api/integrations/servicenow/cmdb/sync` starts a preview or live IRE synchronization. Operator role required.
- `POST /api/integrations/servicenow/changes` creates a simulated or live planned change. Operator role required.
