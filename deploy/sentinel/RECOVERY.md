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
