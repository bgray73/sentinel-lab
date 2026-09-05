# Proxmox operations monitoring

Stage 19 adds cluster-level health to the workload inventory already collected by Sentinel. It uses the existing `PVE_URL`, `PVE_TOKEN_ID`, and `PVE_TOKEN_SECRET` settings and remains in simulation mode when those values are absent.

## What Sentinel checks

| Area | Condition |
| --- | --- |
| Quorum | Cluster quorate state and online member count |
| Storage | Availability plus warning and critical utilization thresholds |
| Tasks | Failed cluster tasks during the latest 24 hours |
| Backups | Latest successful `vzdump` task and failed backup tasks |
| HA | Node and managed-service states returned by HA Manager |
| Replication | Enabled cluster replication jobs and schedules |

Quorum and storage are required collection calls. Task, HA, and replication calls are independent optional checks because permissions and endpoint availability vary by Proxmox version and topology. Sentinel keeps the required snapshot if an optional call fails and shows the exact partial-collection reason on **Cluster health**.

## Read-only access

Use a dedicated Proxmox API token and grant only the read privileges needed for the cluster resources being monitored. The built-in `PVEAuditor` role at `/` is the simplest read-only starting point. Keep privilege separation enabled, do not use a root token, and store the secret through `PVE_TOKEN_SECRET_FILE` where possible.

```dotenv
PVE_URL=https://pve.example.net:8006
PVE_TOKEN_ID=sentinel@pve!monitor
PVE_TOKEN_SECRET_FILE=/run/secrets/pve_token
```

If **Cluster health** reports HTTP 403 for tasks, HA, or replication, review that token's effective permissions. Do not expand it to an administrative role merely to remove an optional warning.

## Thresholds and retention

```dotenv
SENTINEL_PROXMOX_OPERATIONS_INTERVAL_SECONDS=300
SENTINEL_PROXMOX_OPERATIONS_RETENTION_DAYS=30
SENTINEL_PROXMOX_BACKUP_WARNING_HOURS=26
SENTINEL_PROXMOX_BACKUP_CRITICAL_HOURS=48
SENTINEL_PROXMOX_STORAGE_WARNING_PERCENT=80
SENTINEL_PROXMOX_STORAGE_CRITICAL_PERCENT=90
```

Set backup thresholds slightly beyond the normal job interval. For example, the defaults allow a daily job two hours of scheduling variance before warning and mark it critical after two days. The critical threshold must be greater than the warning threshold.

Snapshots are saved with owner-only permissions at `/var/lib/sentinel/proxmox-operations.json`, retained for the configured number of days, and included in Sentinel recovery points. Simultaneous scheduled and operator collections share one in-flight request.

## API and Prometheus

- `GET /api/proxmox/operations` returns settings without credentials, the current health snapshot, and retained history.
- `POST /api/proxmox/operations/collect` runs an immediate collection and requires the operator role.
- `/metrics` exports overall operations health, quorum, failed tasks, backup age, and storage utilization.

Useful alert conditions include `sentinel_proxmox_quorate == 0`, `sentinel_proxmox_failed_tasks_24h > 0`, and storage usage above your configured thresholds. A value of `-1` for quorum or backup age means the API did not report enough information to calculate the signal.
