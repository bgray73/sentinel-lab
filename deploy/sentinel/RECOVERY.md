# Sentinel recovery runbook

## Before an upgrade

1. Open **Recovery** and select **Back up now**.
2. Verify the new recovery point.
3. Record the currently running image reference with `docker compose images`.
4. Prefer an immutable `sha-...` GHCR tag for production upgrades.
5. Pull and start the intended image, then check `/api/health`, inventory, monitors, CMDB, and the Security page.

If the application image fails but data is healthy, set `SENTINEL_IMAGE` back to the recorded image tag and run `docker compose up -d`. A data restore is not needed for an image-only rollback.

## Automated recovery drills

The **Recovery** page can prove a recovery point is readable without changing the running Sentinel installation. A drill selects the newest verified recovery point, restores it into an isolated workspace, verifies the restored SHA-256 manifest, runs SQLite `integrity_check`, parses every JSON state store, records the evidence, and removes the temporary files.

Run one drill manually first. If it passes, enable the weekly schedule:

```dotenv
SENTINEL_RECOVERY_DRILLS_ENABLED=true
SENTINEL_RECOVERY_DRILL_INTERVAL_DAYS=7
SENTINEL_RECOVERY_DRILL_RETENTION_DAYS=180
SENTINEL_RECOVERY_DRILL_SOURCE=auto
```

`auto` prefers a verified external replica and falls back to primary storage. Use `replica` when a drill must fail rather than silently test the primary copy if the external target is unavailable. `primary` always exercises local recovery points. Container deployments place the temporary restore workspace under `/var/lib/sentinel/drill-work`; it is removed after every attempt, including failures.

The drill proves the Sentinel database and state files can be restored and opened. It does not replace the offline production restore procedure below, and it does not restore or boot Proxmox guests. Guest recovery tests require a separately isolated network, reserved VM IDs, temporary storage, and explicit delete permissions.

Drill evidence is administrator-only. `GET /api/recovery/drills` returns status and history, while `POST /api/recovery/drills` runs an immediate drill. Prometheus exports the latest state, age, and consecutive failure count.

## Isolated Proxmox VM and LXC drills

Stage 22 can exercise one designated canary VM or LXC backup through Proxmox VE. Simulation mode is always available and makes no Proxmox write calls. Live mode is manual-only and deliberately requires a separate drill token plus every allowlist value:

```dotenv
SENTINEL_REAL_GUEST_DRILLS=false
SENTINEL_GUEST_DRILL_NODE=pve-drill
SENTINEL_GUEST_DRILL_BACKUP_STORAGE=pbs
SENTINEL_GUEST_DRILL_TARGET_STORAGE=drill-zfs
SENTINEL_GUEST_DRILL_SOURCE_TYPE=qemu
SENTINEL_GUEST_DRILL_SOURCE_VMID=104
SENTINEL_GUEST_DRILL_VMID_MIN=900000
SENTINEL_GUEST_DRILL_VMID_MAX=900099
SENTINEL_GUEST_DRILL_BOOT_SECONDS=30
PVE_DRILL_TOKEN_ID=sentinel-drill@pve!recovery
PVE_DRILL_TOKEN_SECRET_FILE=/run/secrets/pve_drill_token
```

Do not reuse `PVE_TOKEN_ID`; the normal monitoring token should remain read-only. Create a custom drill role instead of granting cluster administrator. It needs audit access to the designated node and PBS-backed storage, space allocation on the scratch storage, guest allocation/configuration, power control, and deletion for temporary guests. Apply it only to the dedicated drill node/storage and test the effective permissions before enabling live mode.

Use a node that is not carrying production HA workloads and a scratch storage target with enough free space for the canary. Reserve the configured VMID range operationally; Sentinel also scans `/cluster/resources` before selecting the ID and checks it again immediately before restore. Do not manually create guests in this range.

A live run performs this fixed sequence:

1. Verify the allowlisted node, storage, and an unused reserved VMID.
2. Select the newest backup for the configured source VMID and type.
3. Restore it powered off onto scratch storage.
4. Read the restored configuration and delete every `netN` interface before boot.
5. Boot for the configured bounded interval and optionally query the QEMU guest agent.
6. Stop the guest and delete it with purge and unreferenced-disk cleanup enabled.

The administrator must confirm the operation in the UI, and the API additionally requires the exact phrase returned by its status endpoint. If a step fails after restore, Sentinel attempts stop and deletion in `finally`. A cleanup failure is retained prominently and exported as `sentinel_guest_recovery_cleanup_required`; treat any nonzero value as an immediate manual task before another run.

Start with a tiny disposable canary whose backup contains no secrets that should exist on the drill node. Even though Sentinel removes virtual NICs before boot, guest hooks, passthrough devices, and unusual backup configuration can have side effects. Review the canary configuration and watch the first live run directly in Proxmox.

Administrator-only endpoints are `GET /api/recovery/guest-drills` and `POST /api/recovery/guest-drills`. History is stored with owner-only permissions and included in Sentinel recovery points. Prometheus exports the latest drill state and unresolved cleanup count.

## Disaster-recovery readiness policy

Stage 23 combines backup and drill evidence into one policy result. The defaults require a verified recovery point no older than 24 hours and a successful Sentinel restore drill no older than eight days. Replica, guest-drill, and live PBS checks remain visible but optional until the matching requirement is enabled:

```dotenv
SENTINEL_RECOVERY_RPO_HOURS=24
SENTINEL_RECOVERY_APP_DRILL_MAX_AGE_DAYS=8
SENTINEL_RECOVERY_GUEST_DRILL_MAX_AGE_DAYS=30
SENTINEL_RECOVERY_REQUIRE_REPLICA=false
SENTINEL_RECOVERY_REQUIRE_GUEST_DRILL=false
SENTINEL_RECOVERY_REQUIRE_PBS=false
```

Roll out requirements in order. First establish scheduled verified backups and weekly Sentinel restore drills. Next configure and verify the off-host replica before setting `SENTINEL_RECOVERY_REQUIRE_REPLICA=true`. After the dedicated Proxmox drill environment has completed several clean live runs, require the guest drill. Require PBS last, after live PBS collection is stable and its API token has the documented audit-only access.

The score is weighted to keep the core recovery controls prominent: recovery-point freshness 25, checksum verification 20, Sentinel restore drill 25, replica 10, guest drill 10, and PBS 10. An optional unavailable control is neutral. A warning receives half its weight and produces **at risk**. Failed or missing required evidence produces **not ready**, regardless of the numeric score.

Use `GET /api/recovery/readiness` for the complete evidence response. Prometheus provides `sentinel_recovery_readiness_score`, `sentinel_recovery_readiness_state`, and one `sentinel_recovery_readiness_check` series per control. Alert on `not-ready` immediately and on `at-risk` only after a short hold period so a single transient PBS warning does not create noise.

## Offline data restore

Never restore while the Sentinel service is running. Replace `<backup-id>` with the exact recovery point shown in the dashboard.

```bash
cd deploy/sentinel
docker compose -f docker-compose.oidc.yml stop sentinel
docker compose -f docker-compose.oidc.yml run --rm --no-deps sentinel \
  node server-dist/backup/restore.js --backup <backup-id> --confirm <backup-id>
docker compose -f docker-compose.oidc.yml up -d
```

For the standard deployment, replace `docker-compose.oidc.yml` with `docker-compose.yml`. The restore validates every checksum before making changes and copies the current data into `/var/lib/sentinel/restore-points` before installing the selected backup.

After startup, verify the container is healthy, sign in, review connection status, and run a simulated monitor suite. Keep the rollback point until the restored system has been validated.

## Host-loss protection

Backups inside the default named volume protect against bad changes and upgrades, but not against loss of the Docker host or its storage. Copy `docker-compose.backup-target.yml.example`, change its host path to a NAS or separately protected filesystem, and include it as an additional Compose file. Keep automated drills enabled and still test the complete offline operator procedure at least quarterly.
