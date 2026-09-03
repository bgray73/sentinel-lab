# SentinelLab reliability test bed

Extensible reliability and infrastructure-health application for Proxmox, VMs, LXC, Docker, web frontends, backend APIs, and LiveNX/LiveWire integration paths.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The API listens on port 4100.

SentinelLab stores tests and run history in `data/sentinel.db`. Set `DATABASE_PATH` to use a different SQLite location. Production builds are served by the API process after running `pnpm build` and `pnpm start`.

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

## Stage 4: Scheduled service monitoring

The **Services** page adds scheduled HTTP/HTTPS, TCP-port, and DNS checks. Sentinel retains results in a local JSON data file, calculates recent uptime and response-time health scores, and restores monitor history after a restart. Stage 7 adds configurable age and record-count limits.

Simulation remains the default. Enable real outbound checks only after the Sentinel API is protected from unauthorized users:

```bash
export SENTINEL_REAL_CHECKS=true
export SENTINEL_DATA_FILE=/var/lib/sentinel/monitoring.json
pnpm start
```

Intervals are restricted to 30 seconds through 24 hours and timeouts to 500 ms through 30 seconds. The data file is written with owner-only permissions. Because monitoring private applications requires access to internal addresses, secure the Sentinel API before enabling real checks.

### Monitoring endpoints

- `GET /api/monitors` returns monitors, latest results, uptime, health scores, and simulation/live mode.
- `GET /api/monitors/history` returns persistent result history; accepts `monitorId` and `limit`.
- `POST /api/monitors` creates a validated HTTP, TCP, or DNS monitor.
- `POST /api/monitors/:id/run` runs one monitor immediately.
- `POST /api/monitors/run-all` runs every enabled monitor.

## Stage 5: Alerts, incidents, and notifications

The **Alerts** page turns repeated monitor failures into incidents. Rules can target one service or every monitor, choose warning or critical severity, set a consecutive-failure threshold, and apply a notification cooldown. Operators can acknowledge incidents, suppress a rule for a maintenance window, and review resolved incidents. A successful check automatically resolves every active incident for that service.

Notification delivery is simulated by default and still recorded in monitoring history. To deliver real webhook or SMTP email alerts, explicitly enable notifications and configure at least one channel:

```bash
export SENTINEL_REAL_NOTIFICATIONS=true
export SENTINEL_WEBHOOK_URL=https://alerts.example.net/sentinel
export SENTINEL_SMTP_URL='smtps://sentinel:encoded-password@smtp.example.net:465'
export SENTINEL_ALERT_EMAIL_TO=operations@example.net
export SENTINEL_ALERT_EMAIL_FROM=sentinel@example.net
pnpm start
```

Keep SMTP credentials in the service environment or a secrets manager, URL-encode reserved characters in the SMTP URL, and never commit them to the repository. Webhooks receive JSON containing the notification event and incident. Failed deliveries are recorded without interrupting monitor execution.

### Alert endpoints

- `GET /api/alerts` returns alert rules and safe notification configuration status.
- `POST /api/alerts` creates a validated alert rule.
- `POST /api/alerts/:id/suppress` starts a timed suppression window.
- `GET /api/incidents` returns incident history and accepts an optional `status` filter.
- `POST /api/incidents/:id/acknowledge` acknowledges an active incident.
- `GET /api/notifications` returns notification delivery history.

## Stage 6: Dependency topology and root-cause correlation

The **Topology** page joins Proxmox resources, the Docker host, Compose applications, containers, and service monitors into one directed dependency graph. Sentinel automatically proposes service mappings from resource names and monitor targets. Operators can confirm an upstream resource with a manual mapping; confirmed mappings take priority and persist with the monitoring data.

When incidents are active, Sentinel walks upstream from each affected service. An unhealthy shared dependency becomes the probable root cause and related incidents are consolidated into one correlation group. Every group shows the affected services, dependency distance, resource state, and a heuristic confidence score. If no unhealthy upstream dependency exists, Sentinel keeps the event at service level instead of claiming an unsupported infrastructure cause.

Correlation is advisory only. Stage 6 does not restart workloads, alter Proxmox, or close incidents. Live topology requires both configured Proxmox and Docker connections; simulation remains the default.

### Topology endpoints

- `GET /api/topology` returns the simulated graph, mappings, correlation groups, and summary.
- `GET /api/topology?simulate=false` builds a live graph from configured Proxmox and Docker connections.
- `POST /api/topology/mappings` confirms a monitor-to-resource dependency.
- `DELETE /api/topology/mappings/:id` removes a confirmed mapping and restores automatic inference.

## Stage 7: Historical metrics and Prometheus export

The **Metrics** page aggregates stored service checks into 1-hour, 6-hour, 24-hour, 7-day, and 30-day views. It displays overall availability, failures, average and P95 latency, plus a response-time chart for every monitor. Empty time buckets remain visible as gaps instead of being reported as successful checks.

The default retention policy keeps up to 25,000 results for 30 days. Operators can select 1–365 days and a 1,000–100,000 record limit. Results exceeding either limit are pruned during collection and immediately after a policy reduction. Pruned results cannot be recovered from Sentinel's monitoring file, so back up the data before reducing retention if the history is important.

Prometheus-compatible current gauges are available at `GET /metrics`:

```yaml
scrape_configs:
  - job_name: sentinel
    static_configs:
      - targets: ['sentinel-host:4100']
```

The export includes monitor status, latest latency, health score, uptime, active incidents, enabled alert rules, operating mode, and retained-result count. The endpoint exposes internal monitor names; protect it with network controls or an authenticated reverse proxy when Sentinel is not on a trusted management network.

### Metric endpoints

- `GET /api/metrics?range=24h` returns bucketed history and summaries; supported ranges are `1h`, `6h`, `24h`, `7d`, and `30d`.
- `PUT /api/metrics/settings` updates `days` and `maxResults`, then applies pruning.
- `GET /metrics` returns Prometheus text exposition format.

## Verify

```bash
pnpm test
pnpm build
```
