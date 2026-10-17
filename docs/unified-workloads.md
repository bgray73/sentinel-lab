# Unified workload inventory (preview)

Sentinel's Workloads view combines Proxmox VMs, LXC guests and Docker containers. It is **read-only**. It does not install software or change any guests.

## Modes

The default **Demo** mode returns simulated workloads. Select **Live** in the Workloads view to query configured infrastructure. A live request returns an error when a configured source cannot be reached rather than silently showing incomplete inventory.

## Configuration

Proxmox uses existing `PVE_URL`, `PVE_TOKEN_ID`, and `PVE_TOKEN_SECRET` settings. The existing single Docker engine settings (`DOCKER_SOCKET_PATH` or `DOCKER_HOST_URL`) remain supported.

Additional Docker targets can be defined as a JSON array in `DOCKER_HOSTS_JSON`:

```json
[
  {"id":"ai01","baseUrl":"https://docker-ai.example:2376","caPath":"/run/secrets/docker-ca.pem","certPath":"/run/secrets/docker-client.pem","keyPath":"/run/secrets/docker-client-key.pem"},
  {"id":"apps01","baseUrl":"https://docker-apps.example:2376","caPath":"/run/secrets/docker-ca.pem","certPath":"/run/secrets/docker-client.pem","keyPath":"/run/secrets/docker-client-key.pem"}
]
```

The multi-host collector requires HTTPS URLs and uses Node's standard certificate verification. The collector now requires absolute paths to a CA certificate, client certificate, and client private key for each remote host, and verifies server certificates. Mount these secrets read-only with restricted filesystem permissions. Configure each Docker daemon for TLS client-certificate authentication and restrict network access. Do not expose unauthenticated Docker APIs, even on a private VLAN. Validate the certificate chain and authorization before using live endpoints.

Each target must have a unique ID. A host that is unreachable causes the live unified API to return HTTP 502 with the affected target IDs.

## API

`GET /api/workloads` returns demo data.

`GET /api/workloads?simulate=false` queries live configured sources. Existing Sentinel authentication applies. Returned workload IDs include provider and Docker target identity to avoid collisions.

## Deployment validation (read-only)

1. Copy `deploy/sentinel/.env.example` to a local `.env` and keep it outside version control. Leave `SENTINEL_ENABLE_WORKLOAD_ACTIONS=false`. Do not mount the Docker socket during the initial rollout.
2. Configure `PVE_URL`, `PVE_TOKEN_ID` and a read-only `PVEAuditor` API token secret. Prefer `PVE_TOKEN_SECRET_FILE` with a read-only mounted secret; confirm the container can read it. Trust your Proxmox CA via `NODE_EXTRA_CA_CERTS` if necessary.
3. Run `docker compose -f deploy/sentinel/docker-compose.yml config` to validate configuration, then `docker compose -f deploy/sentinel/docker-compose.yml up -d --build` on the intended Sentinel host only after reviewing bind addresses, secrets, and storage.
4. Confirm `GET /api/health` returns 200 and `GET /api/workloads` shows demo data. Use `GET /api/workloads?simulate=false` to check live Proxmox inventory. Compare VM and LXC counts with Proxmox itself.
5. Verify `GET /api/workloads/actions/status` reports `enabled:false`. Keep the API bound to loopback unless it is protected by a trusted authentication proxy. Do not open port 4100 to the network without authentication.
6. For rollback, return to the previous container image and preserve `/var/lib/sentinel` persistent data; do not delete volumes. Back up the data directory before upgrading an existing deployment.

**Warning:** Docker socket mounts grant powerful host-level access even when configured `:ro`. Do not use `docker-compose.live-docker.yml` until the deployment security review is complete. The remote Docker mTLS settings also require certificates to be mounted inside the Sentinel container; environment variables alone do not mount them.

## Before merging

Run `pnpm test` and `pnpm build:production`, review the GitHub Actions CI and container-build jobs, and verify authorization at the reverse proxy. Keep write operations disabled until audited, role-gated actions are implemented.
