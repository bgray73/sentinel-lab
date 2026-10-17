# Unified workload inventory (preview)

Sentinel's Workloads view combines Proxmox VMs, LXC guests and Docker containers. It is **read-only**. It does not install software or change any guests.

## Modes

The default **Demo** mode returns simulated workloads. Select **Live** in the Workloads view to query configured infrastructure. A live request returns an error when a configured source cannot be reached rather than silently showing incomplete inventory.

## Configuration

Proxmox uses existing `PVE_URL`, `PVE_TOKEN_ID`, and `PVE_TOKEN_SECRET` settings. The existing single Docker engine settings (`DOCKER_SOCKET_PATH` or `DOCKER_HOST_URL`) remain supported.

Additional Docker targets can be defined as a JSON array in `DOCKER_HOSTS_JSON`:

```json
[
  {"id":"ai01","baseUrl":"https://docker-ai.example:2376"},
  {"id":"apps01","baseUrl":"https://docker-apps.example:2376"}
]
```

The multi-host collector requires HTTPS URLs and uses Node's standard certificate verification. **It does not yet support Docker client certificates or per-host authentication.** Do not expose unauthenticated Docker APIs, even on a private VLAN. Do not use this configuration for live remote engines until mutually authenticated TLS or an equivalent authenticated proxy has been implemented and verified.

Each target must have a unique ID. A host that is unreachable causes the live unified API to return HTTP 502 with the affected target IDs.

## API

`GET /api/workloads` returns demo data.

`GET /api/workloads?simulate=false` queries live configured sources. Existing Sentinel authentication applies. Returned workload IDs include provider and Docker target identity to avoid collisions.

## Before merging

Run `pnpm test` and `pnpm build:production`, review the GitHub Actions CI and container-build jobs, and verify authorization at the reverse proxy. Keep write operations disabled until audited, role-gated actions are implemented.
