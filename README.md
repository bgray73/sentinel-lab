# SentinelLab reliability test bed

Extensible reliability and infrastructure-health application for Proxmox, VMs, LXC, Docker, web frontends, backend APIs, and LiveNX/LiveWire integration paths.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The API listens on port 4100.

Simulation mode is the safe default. Real HTTP(S) checks require an explicit `simulate: false` in `POST /api/runs`; timeouts are capped at 30 seconds. Credentials are intentionally not stored in this prototype.

Included surfaces: browser journeys, API contracts, container readiness, LiveNX telemetry freshness, LiveWire LiveFlow/OpenTelemetry export, release scoring, and run history.

## Stage 1: Proxmox inventory

Sentinel can now discover Proxmox nodes, QEMU virtual machines, LXC containers, and storage through a read-only API token. Simulation mode remains the default so the application works without access to a real cluster.

```bash
# Safe sample inventory
curl http://localhost:4100/api/inventory

# Real read-only discovery
export PVE_URL=https://pve.example.net:8006
export PVE_TOKEN_ID='sentinel@pve!monitoring'
export PVE_TOKEN_SECRET='replace-with-token-secret'
curl 'http://localhost:4100/api/inventory?simulate=false'
```

Create a dedicated Proxmox user and API token with the `PVEAuditor` role at `/`. Do not use a root token. Sentinel reads `/cluster/resources` and `/cluster/status`; it does not currently issue any write request.

Use a certificate trusted by the Sentinel host. For a private CA, set Node's `NODE_EXTRA_CA_CERTS` to the CA certificate. Plain HTTP is rejected unless `PVE_ALLOW_HTTP=true` is deliberately set for an isolated development lab.

### Inventory endpoints

- `GET /api/proxmox/status` reports whether environment-based configuration is present.
- `GET /api/inventory` returns a simulated cluster inventory.
- `GET /api/inventory?simulate=false` connects to the configured Proxmox API.

## Stage 2: Infrastructure dashboard

Select **Proxmox** in the Sentinel sidebar to open the infrastructure inventory. The dashboard displays cluster totals, simulation/live source status, health warnings, node utilization, and the VM/LXC and storage resources associated with each node. Refresh failures preserve and label the last successful inventory instead of clearing the dashboard.

## Stage 3: Connections and Docker applications

The **Connections** page reports whether Proxmox and Docker configuration is available without exposing secrets to the browser. The **Docker** page groups containers into Compose applications and displays container state, health checks, images, and published ports.

Docker discovery is disabled until an absolute socket path is explicitly configured:

```bash
export DOCKER_SOCKET_PATH=/var/run/docker.sock
curl 'http://localhost:4100/api/docker/inventory?simulate=false'
```

Sentinel only calls Docker's read-only `/info` and `/containers/json?all=1` endpoints. Access to the Docker socket is highly privileged even when the application only issues GET requests: never publish the socket over an unauthenticated TCP endpoint, and run Sentinel with the minimum required host permissions.

### Docker and connection endpoints

- `GET /api/connections` reports whether Proxmox and Docker are configured.
- `GET /api/docker/status` reports Docker configuration state.
- `GET /api/docker/inventory` returns safe simulated container data.
- `GET /api/docker/inventory?simulate=false` discovers the configured Docker Engine.
