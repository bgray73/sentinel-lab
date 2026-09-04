# Sentinel recovery runbook

## Before an upgrade

1. Open **Recovery** and select **Back up now**.
2. Verify the new recovery point.
3. Record the currently running image reference with `docker compose images`.
4. Prefer an immutable `sha-...` GHCR tag for production upgrades.
5. Pull and start the intended image, then check `/api/health`, inventory, monitors, CMDB, and the Security page.

If the application image fails but data is healthy, set `SENTINEL_IMAGE` back to the recorded image tag and run `docker compose up -d`. A data restore is not needed for an image-only rollback.

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

Backups inside the default named volume protect against bad changes and upgrades, but not against loss of the Docker host or its storage. Copy `docker-compose.backup-target.yml.example`, change its host path to a NAS or separately protected filesystem, and include it as an additional Compose file. Test an offline restore at least quarterly.
