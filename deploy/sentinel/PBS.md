# Proxmox Backup Server health

Stage 20 adds recoverability monitoring for Proxmox Backup Server (PBS). Proxmox VE task history can show that a backup job finished, but PBS is the authoritative source for whether the recovery point is present, verified, retained, and stored on healthy capacity.

## What Sentinel reads

Sentinel uses the PBS JSON API and never reads backup payloads or starts, deletes, verifies, prunes, syncs, or restores a backup.

| API area | Purpose | Failure behavior |
| --- | --- | --- |
| `/status/datastore-usage` | Datastore capacity and discovery | Required; collection fails if unavailable |
| `/admin/datastore/{store}/snapshots` | Snapshot freshness and verification state | Isolated per datastore and reported as a collection warning |
| `/nodes/localhost/tasks` | Failed tasks and last successful garbage collection | Optional and reported as a collection warning |
| `/config/sync` | Configured sync jobs | Optional and reported as a collection warning |
| `/config/prune` | Configured prune jobs | Optional and reported as a collection warning |

The dashboard reports datastore pressure, the age of each datastore's newest snapshot, successful and failed verification results, failed tasks from the last 24 hours, garbage-collection age, and enabled sync and prune jobs. A missing optional privilege reduces visibility without discarding datastore data.

## Create a read-only API token

Create a dedicated PBS user and API token, for example `sentinel@pbs!monitor`. Give the user or token only the audit access required for the datastores Sentinel should observe:

- `Audit` on `/` for server status, task history, and job configuration visibility.
- `DatastoreAudit` on each `/datastore/<name>` path that Sentinel should inventory.
- `RemoteAudit` only when your PBS release and sync configuration require it to display remote-backed sync jobs.

PBS evaluates an API token using the intersection of the token's ACLs and its user's ACLs. If privilege separation is enabled, assign the audit ACLs to both identities. Do not grant `Administrator`, datastore modification privileges, or `DatastoreReader`; Sentinel does not download backup contents.

Record the token secret when the token is created, then configure Sentinel:

```bash
PBS_URL=https://pbs.example.net:8007
PBS_TOKEN_ID=sentinel@pbs!monitor
PBS_TOKEN_SECRET_FILE=/run/secrets/pbs_token
```

The direct `PBS_TOKEN_SECRET` variable is supported for local evaluation, but a mounted secret file is preferred for deployment. PBS must present a certificate trusted by the Sentinel container. Import the private CA into the container trust store when PBS uses an internal PKI; do not disable TLS verification. Plain HTTP is rejected by default.

Start with the audit-only token and review the dashboard's **Collection gaps** area. An HTTP 403 against one optional endpoint identifies the exact visibility that is missing and does not justify granting broad administrator access.

## Thresholds

| Variable | Default | Meaning |
| --- | ---: | --- |
| `SENTINEL_PBS_INTERVAL_SECONDS` | 900 | Collection frequency |
| `SENTINEL_PBS_RETENTION_DAYS` | 30 | Local health-history retention |
| `SENTINEL_PBS_SNAPSHOT_WARNING_HOURS` | 26 | Newest snapshot warning age |
| `SENTINEL_PBS_SNAPSHOT_CRITICAL_HOURS` | 48 | Newest snapshot critical age |
| `SENTINEL_PBS_VERIFICATION_WARNING_DAYS` | 7 | Age at which an unverified snapshot warns |
| `SENTINEL_PBS_GC_WARNING_DAYS` | 7 | Age at which the latest successful GC warns |
| `SENTINEL_PBS_STORAGE_WARNING_PERCENT` | 80 | Datastore utilization warning |
| `SENTINEL_PBS_STORAGE_CRITICAL_PERCENT` | 90 | Datastore utilization critical threshold |

Set the snapshot thresholds slightly above the expected backup schedule. A daily policy commonly uses the supplied 26-hour warning so normal schedule drift does not generate noise. The critical threshold must be greater than the warning threshold; the same ordering rule applies to storage thresholds.

## API, metrics, and recovery

- `GET /api/pbs/health` returns configuration status, the current result, and retained history.
- Operator-only `POST /api/pbs/health/collect` starts a collection and returns its result.
- `/metrics` exports `sentinel_pbs_health`, snapshot totals, unverified snapshot totals, 24-hour failed tasks, per-datastore utilization, and newest-snapshot age.
- `/var/lib/sentinel/pbs-health.json` stores the history with owner-only permissions and is included in Sentinel recovery points.

Without complete PBS credentials, Sentinel intentionally displays simulated data so the screen and alert shape can be evaluated safely. The page clearly labels simulation mode.
