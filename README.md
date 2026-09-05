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

## Stage 8: Infrastructure telemetry and CMDB

The **Performance** page collects CPU, memory, disk-capacity, network-throughput, and block-I/O history for Proxmox nodes, VMs, LXC containers, and Docker containers. Simulation is the safe default. Live collection uses the existing read-only Proxmox and Docker connections:

```bash
export SENTINEL_REAL_TELEMETRY=true
export SENTINEL_TELEMETRY_INTERVAL_SECONDS=60
export SENTINEL_TELEMETRY_FILE=/var/lib/sentinel/telemetry.json
```

The **CMDB** page provides ServiceNow-style configuration-management fundamentals: automatically discovered and manually created configuration items, stable external identifiers, ownership, environment, criticality, tags, lifecycle, relationships, reconciliation, and an audit trail. Missing discovered resources are marked `stale` rather than deleted, and discovery updates do not overwrite operator-maintained metadata.

```bash
export SENTINEL_REAL_CMDB=true
export SENTINEL_CMDB_DISCOVERY_INTERVAL_SECONDS=300
export SENTINEL_CMDB_FILE=/var/lib/sentinel/cmdb.json
```

### Stage 8 endpoints

- `GET /api/infrastructure/metrics?range=24h` returns bucketed resource history.
- `POST /api/infrastructure/metrics/collect` collects one sample immediately.
- `GET /api/cmdb/snapshot` exports CMDB status, items, relationships, and recent changes.
- `GET /api/cmdb/items` supports `class`, `lifecycle`, and `search` filters.
- `POST /api/cmdb/items` and `PATCH /api/cmdb/items/:id` maintain manual metadata.
- `GET /api/cmdb/relationships` and `POST /api/cmdb/relationships` expose the relationship map.
- `GET /api/cmdb/changes` returns the audit history.
- `POST /api/cmdb/reconcile` runs discovery and reconciliation immediately.
- `GET /metrics` also exports the latest infrastructure gauges.

### LabOps / Dashboard_Test integration direction

Do not merge the repositories wholesale yet. LabOps already has OIDC, PostgreSQL, device inventory, incidents, maintenance, reports, and webhooks, so it is the stronger long-term control plane and authoritative CMDB. SentinelLab should initially remain the specialized Proxmox/Docker discovery and telemetry provider, integrated through the versioned CMDB snapshot and metrics APIs. Once this boundary is proven, Sentinel modules can be moved into the LabOps monorepo without carrying duplicate inventory and incident implementations forward.

## Stage 9: Centralized logging with Loki

The **Logs** page searches centralized events, filters by time, level, source, service, and message text, and uses stable CMDB external identifiers to connect log evidence to infrastructure and services. Active incidents can be investigated directly; Sentinel queries logs for the affected service and its confirmed upstream dependencies.

Sentinel emits structured JSON request logs to standard output. Sensitive fields whose names resemble passwords, secrets, tokens, API keys, authorization headers, or cookies are redacted before output. Loki remains the raw-log system of record; Sentinel stores and displays investigation results without duplicating Loki's database.

When `LOKI_URL` is absent, the Logs page uses safe simulated data. To connect Sentinel to a private Loki endpoint:

```bash
export LOKI_URL=http://loki.internal:3100
export LOKI_ALLOW_HTTP=true
export LOKI_TIMEOUT_MS=5000
pnpm start
```

Prefer HTTPS whenever Loki crosses a host or trust boundary. Plain HTTP requires the explicit `LOKI_ALLOW_HTTP=true` acknowledgement.

## Stage 10: physical infrastructure

Sentinel now discovers out-of-band server health with Redfish and network or power equipment through Prometheus SNMP Exporter. The normalized inventory covers chassis state, temperatures, fans, power supplies, storage controllers and drives, interfaces and errors, UPS battery runtime, and power load. Discovered devices become CMDB configuration items; a Redfish server whose reported host name matches a Proxmox node is linked as its physical host.

Simulation remains the default. To enable live, read-only discovery:

```bash
export SENTINEL_REAL_HARDWARE=true
export SENTINEL_HARDWARE_DISCOVERY_INTERVAL_SECONDS=300
export SENTINEL_HARDWARE_TIMEOUT_MS=8000
export SENTINEL_REDFISH_TARGETS='[{"id":"pve-01","name":"pve-01","url":"https://idrac-pve-01.example.net","username":"sentinel","password":"use-a-secret-manager"}]'
export SNMP_EXPORTER_URL=http://127.0.0.1:9116
export SNMP_EXPORTER_ALLOW_HTTP=true
export SENTINEL_SNMP_TARGETS='[{"id":"core-01","name":"Core switch","target":"10.20.0.2","category":"switch","module":"if_mib","auth":"sentinel_v3"},{"id":"ups-01","name":"Rack UPS","target":"10.20.0.20","category":"ups","module":"ups_mib","auth":"sentinel_v3"}]'
```

Use a dedicated read-only Redfish account and trusted HTTPS certificates. `REDFISH_ALLOW_HTTP=true` exists only for isolated legacy management networks. Redfish passwords are never returned by the API.

Run the bundled SNMP exporter profile from `deploy/observability`:

```bash
cp .env.example .env
# Set unique SNMP_USERNAME, SNMP_AUTH_PASSWORD, and SNMP_PRIV_PASSWORD values.
docker compose --profile hardware up -d
```

The example uses SNMPv3 `authPriv`; Sentinel sends only a target, module, and auth-profile name to the exporter, so device credentials stay centralized in the exporter. Its port binds to loopback by default. The new endpoints are `GET /api/hardware/status`, `GET /api/hardware/inventory`, and `POST /api/hardware/discover`.

## Stage 11: hardware operations and drift

Stage 11 turns the Stage 10 inventory into actionable, retained findings without duplicating LabOps' authoritative incident workflow. Sentinel evaluates device and component health, temperature, power-capacity utilization, UPS runtime and load, interface errors, and accepted firmware baselines after every hardware collection. Findings automatically resolve when a condition clears.

Planned work can be placed into a device-specific or global maintenance window. A finding remains visible and auditable during maintenance, but is marked suppressed and excluded from actionable warning and critical totals. The Hardware page includes quick two-hour maintenance windows and firmware-baseline controls; custom windows are available through the API.

Operations data is stored in `.sentinel/hardware-operations.json` by default with owner-only file permissions. Override the location with `SENTINEL_HARDWARE_OPERATIONS_FILE`. Default thresholds are intentionally conservative and can be adjusted with:

```bash
export HARDWARE_TEMPERATURE_WARNING_C=70
export HARDWARE_TEMPERATURE_CRITICAL_C=80
export HARDWARE_POWER_WARNING_PERCENT=80
export HARDWARE_POWER_CRITICAL_PERCENT=90
export HARDWARE_UPS_RUNTIME_WARNING_MINUTES=20
export HARDWARE_UPS_RUNTIME_CRITICAL_MINUTES=10
export HARDWARE_UPS_LOAD_WARNING_PERCENT=80
export HARDWARE_UPS_LOAD_CRITICAL_PERCENT=90
export HARDWARE_INTERFACE_ERRORS_WARNING=100
export HARDWARE_INTERFACE_ERRORS_CRITICAL=10000
```

Stage 11 adds `GET /api/hardware/operations`, `POST /api/hardware/maintenance`, `DELETE /api/hardware/maintenance/:id`, and `POST /api/hardware/baselines/:deviceId`. Active findings and device health are also included in `/metrics` for Prometheus. LabOps can consume these stable outputs and remain the final owner of incidents, maintenance governance, and operator notifications.

For the planned LabOps integration, set a long random `LABOPS_EXPORT_TOKEN` and call `GET /api/integrations/labops/v1/snapshot` with `Authorization: Bearer <token>`. The versioned response combines CMDB items and relationships with current hardware inventory, findings, maintenance state, and firmware baselines. The endpoint stays disabled until a token is configured; expose it only on the trusted management network or behind LabOps OIDC.

### Run the included observability stack

The `deploy/observability` directory contains a small-lab, single-binary Loki deployment, Grafana with a provisioned Loki data source, and Grafana Alloy collection for Docker, systemd journal, and TCP/UDP syslog.

```bash
cd deploy/observability
cp .env.example .env
# Replace the sample Grafana password and review every bind address.
docker compose up -d
```

Safe defaults bind Grafana, Alloy's UI, and the syslog receiver to localhost. Place Grafana behind LabOps OIDC, an authenticated reverse proxy, or a private Tailscale/management network before changing a bind address. The Docker socket is mounted read-only but still exposes highly privileged host metadata to Alloy; do not expose Alloy's API publicly.

The sample Loki configuration keeps logs for 30 days. Retention is time-based rather than free-space-based, so monitor the Loki volume and size it with headroom. For higher availability or more than small-lab volume, replace the filesystem backend with supported object storage and move beyond the included single-instance Compose deployment.

### Logging endpoints

- `GET /api/logs/status` reports simulation/live mode without returning credentials.
- `GET /api/logs` accepts `range`, `limit`, `level`, `source`, `service`, `ciId`, and `search` filters.
- `GET /api/logs/incidents/:id/correlation` returns log evidence for an incident's monitored service and confirmed dependencies.

## Verify

```bash
pnpm test
pnpm build:production
```

## Stage 12: secure container deployment

Stage 12 packages the dashboard and API into one production image. The process runs as an unprivileged user, writes only to `/var/lib/sentinel`, exposes an application health check, and adds defensive browser headers. The supplied Compose service drops Linux capabilities, prevents privilege escalation, uses a read-only root filesystem, and binds to `127.0.0.1` by default.

```bash
cd deploy/sentinel
cp .env.example .env
docker compose up -d --build
docker compose ps
```

Open `http://127.0.0.1:4100`. Keep this loopback binding for a workstation preview. For access from another device, put Sentinel behind LabOps OIDC, an authenticated reverse proxy, or a private management-network gateway before changing `SENTINEL_BIND_ADDRESS`. The application itself does not yet provide interactive user authentication.

All database and JSON state is retained in the `sentinel-data` volume. Back up that volume before replacing a host. The default `.env.example` leaves discovery, checks, notifications, telemetry, CMDB reconciliation, and hardware polling in simulation mode. Add credentials to the untracked `.env` file and enable each live feature only after the network boundary is protected.

Docker discovery requires privileged host metadata. Enable it only on a trusted Sentinel host with the explicit override:

```bash
docker compose -f docker-compose.yml -f docker-compose.live-docker.yml up -d
```

The socket is mounted read-only, but Docker socket access can still effectively control the host. Do not expose the Sentinel API to untrusted users when this override is active.

The `Container` GitHub Actions workflow builds the image for every pull request. Merges to `main` also publish `ghcr.io/bgray73/sentinel-lab:latest` and an immutable commit-SHA tag to GitHub Container Registry.

## Stage 13: authentication and role-based access

Sentinel can now enforce identity and permissions supplied by LabOps OIDC or another trusted authentication proxy. Sentinel does not accept passwords and does not trust forwarded identity headers on their own. In proxy mode, every browser request must also contain a private, random `X-Sentinel-Proxy-Secret` header injected by the proxy.

Configure the container with:

```bash
SENTINEL_AUTH_MODE=proxy
SENTINEL_AUTH_PROXY_SECRET=replace-with-at-least-32-random-characters
SENTINEL_AUTH_ADMIN_GROUPS=sentinel-admins
SENTINEL_AUTH_OPERATOR_GROUPS=sentinel-operators
SENTINEL_METRICS_TOKEN=replace-with-a-different-32-character-token
```

The proxy must remove any incoming `X-Forwarded-User`, `X-Forwarded-Name`, `X-Forwarded-Email`, `X-Forwarded-Groups`, and `X-Sentinel-Proxy-Secret` values before inserting trusted replacements. It should send comma-separated group names. Do not publish the Sentinel container port directly in proxy mode; only the authentication proxy should be able to reach it.

| Role | Access |
| --- | --- |
| Viewer | Read dashboards, inventory, CMDB, logs, findings, and history |
| Operator | Viewer access plus run checks, collect telemetry, reconcile discovery, acknowledge incidents, and manage operational maintenance/mappings |
| Administrator | Full access, including monitor, alert, test, retention, and CMDB configuration |

Users in `SENTINEL_AUTH_ADMIN_GROUPS` become administrators, users in `SENTINEL_AUTH_OPERATOR_GROUPS` become operators, and every other authenticated user is a viewer. The UI displays the resolved identity and role; the API independently enforces the same permissions. `GET /api/session` returns the current session without exposing proxy secrets.

`GET /api/health` remains unauthenticated for container health checks. In proxy mode, Prometheus can call `GET /metrics` with `Authorization: Bearer <SENTINEL_METRICS_TOKEN>`. The LabOps snapshot continues to use its separate `LABOPS_EXPORT_TOKEN`. Use different random values for all three tokens.

## Stage 14: OIDC gateway and security audit

The optional `docker-compose.oidc.yml` profile turns the Stage 13 trust contract into a deployable gateway. OAuth2 Proxy v7.15.4 performs standards-based OIDC login, then an internal Caddy 2.11.4 bridge injects the private Sentinel proxy secret. Only the gateway publishes a port; Sentinel and the bridge remain on an internal Docker network.

Register this callback with LabOps OIDC, Entra ID, Keycloak, Authentik, Okta, or another OIDC provider:

```text
https://sentinel.example.net/oauth2/callback
```

Then copy the example environment file and set the OIDC values. Generate separate secrets rather than reusing credentials:

```bash
cd deploy/sentinel
cp .env.example .env
openssl rand -hex 32       # SENTINEL_AUTH_PROXY_SECRET
openssl rand -base64 32    # SENTINEL_OIDC_COOKIE_SECRET
openssl rand -hex 32       # SENTINEL_METRICS_TOKEN
docker compose -f docker-compose.oidc.yml up -d
```

The gateway uses secure cookies, so terminate trusted HTTPS in front of its loopback-bound port and make the public URL match `SENTINEL_OIDC_REDIRECT_URL`. Do not change `SENTINEL_BIND_ADDRESS` to a public interface unless host firewall rules restrict the port to that TLS proxy. If the GHCR package is private, run `docker login ghcr.io` before starting the stack.

Administrators now have a **Security** page that reports authenticated sessions, failed authentication, authorization denials, source addresses, requested paths, and required roles. Events persist with owner-only permissions at `/var/lib/sentinel/security-audit.json`. Defaults retain 90 days and at most 10,000 events; configure `SENTINEL_AUTH_AUDIT_RETENTION_DAYS` and `SENTINEL_AUTH_AUDIT_MAX_EVENTS` to change those limits.

`GET /api/security/events` is administrator-only and accepts `limit` plus a `type` filter of `session_authenticated`, `authentication_failed`, or `authorization_denied`. Prometheus also exports retained security-event, authentication-failure, and authorization-denial gauges.

## Stage 15: backup, restore, and upgrade rollback

Sentinel now creates checksummed recovery points containing a transactional SQLite snapshot plus every available monitoring, telemetry, CMDB, hardware-operations, and security-audit data file. Container deployments enable a backup every 24 hours and retain the newest 14 by default. Change `SENTINEL_BACKUPS_ENABLED`, `SENTINEL_BACKUP_INTERVAL_HOURS`, or `SENTINEL_BACKUP_MAX_COUNT` to adjust the policy.

Administrators can create and verify recovery points from the **Recovery** page. The administrator-only endpoints are `GET /api/backups`, `POST /api/backups`, and `POST /api/backups/:id/verify`. `/metrics` includes retained-backup count, verified-backup count, and latest-backup age.

Restores are deliberately offline and cannot be started from the browser. Stop Sentinel and provide the backup identifier twice:

```bash
docker compose -f docker-compose.oidc.yml stop sentinel
docker compose -f docker-compose.oidc.yml run --rm --no-deps sentinel \
  node server-dist/backup/restore.js --backup <backup-id> --confirm <backup-id>
docker compose -f docker-compose.oidc.yml up -d
```

Every restore verifies SHA-256 checksums first and preserves the current files under `/var/lib/sentinel/restore-points`. For an application-only problem, roll back `SENTINEL_IMAGE` to the previous immutable `sha-...` tag instead of restoring data. See `deploy/sentinel/RECOVERY.md` for the complete checklist.

The default backup directory is on the Sentinel data volume. That protects against bad upgrades but not host or disk loss. Stage 17 adds a separately verified replica target so the local recovery point remains available while a second copy is written to a NAS or protected filesystem.

## Stage 16: distributed collectors and multi-site monitoring

Sentinel can now enroll outbound-only collectors for remote Proxmox clusters, Docker hosts, or hybrid sites. Each collector receives a high-entropy credential once; the central service stores only its SHA-256 hash. Snapshots use increasing sequence numbers to prevent replay and are limited to 5,000 Proxmox resources and 5,000 containers per collector.

The **Sites** dashboard shows online, stale, and never-connected collectors, agent versions, remote workload totals, site-level warnings, and last heartbeat age. Online remote inventories are reconciled into the CMDB with site and collector identifiers, while the most recent snapshot remains visible when a collector is offline. Prometheus exports collector count, online count, stale count, and remote-resource count.

The lightweight agent buffers up to 100 snapshots on disk when Sentinel cannot be reached and sends them in order after service recovers. See `deploy/sentinel/COLLECTORS.md` and `docker-compose.collector.yml.example` for enrollment, least-privilege configuration, token rotation, and deployment guidance.

## Stage 17: integrations, ticket automation, and backup replication

The **Automation** page now reports generic webhook, Slack, Microsoft Teams, SMTP, and ServiceNow route readiness. Each open, reminder, and resolved incident event creates an independent delivery record. Failed attempts do not block monitor execution and can be retried by an operator without resending successful channels.

ServiceNow integration uses the Incident Table API. Sentinel creates one external incident with its own incident ID as the correlation ID, appends reminders to that record, and closes it when the monitor recovers. The returned ticket number and link are stored with the Sentinel incident and displayed in Automation. Configure a dedicated least-privilege integration account with either a bearer token or username/password.

Sensitive settings support Docker-style secret files. Set a direct variable such as `SENTINEL_SLACK_WEBHOOK_URL`, or leave it empty and set `SENTINEL_SLACK_WEBHOOK_URL_FILE=/run/secrets/slack_webhook`. This also applies to ServiceNow credentials, SMTP and generic webhook URLs, the Proxmox token secret, Sentinel service tokens, and remote collector tokens.

Set `SENTINEL_BACKUP_REPLICA_DIR` to a separately mounted target to copy every verified primary recovery point. Sentinel publishes each replica atomically and verifies the same SHA-256 manifest after copying. The **Recovery** page reports replica coverage and can retry a missing or failed copy; Prometheus exports `sentinel_backups_replicated`.

New endpoints are `GET /api/automation`, `POST /api/notifications/:id/retry`, and `POST /api/backups/:id/replicate`. See `deploy/sentinel/INTEGRATIONS.md` for configuration and the backup-target Compose override.

## Stage 18: ServiceNow CMDB and change automation

The **Automation** workspace now includes a ServiceNow configuration-management bridge. It previews or synchronizes active Sentinel CIs through ServiceNow's Identification and Reconciliation Engine, carries supported relationships, persists stable CI-to-`sys_id` mappings, and reports every sync run. Dry-run mode is the default and never calls ServiceNow.

Operators can create a planned ServiceNow change linked to a synchronized CI. Optional maintenance automation creates the same change when a hardware maintenance window is scheduled. Both features reuse the protected ServiceNow credentials from Stage 17 while retaining separate live-mode controls, so incident delivery does not implicitly enable CMDB writes.

Set `SENTINEL_REAL_SERVICENOW_CMDB=true` only after validating a preview, the ServiceNow discovery-source choice, target classes, relationship types, and the integration account's permissions. Keep `SENTINEL_SERVICENOW_AUTO_CHANGE=false` until the change workflow has been accepted. See `deploy/sentinel/INTEGRATIONS.md` for the complete setup checklist and class map.

New endpoints are `GET /api/integrations/servicenow/cmdb`, `POST /api/integrations/servicenow/cmdb/sync`, and `POST /api/integrations/servicenow/changes`. `/metrics` also exports CMDB mapping, sync-health, failed-item, and change-status gauges.

## Stage 19: Proxmox cluster operations health

The **Cluster health** page now monitors Proxmox conditions that workload inventory alone cannot detect: cluster quorum, offline members, storage pressure, failed tasks, backup freshness, HA resource state, and configured replication jobs. It provides an overall health verdict, actionable findings, storage utilization bars, recent task results, and HA/replication summaries.

Sentinel collects every five minutes by default and retains 30 days of snapshots. Quorum and storage calls are required; task, HA, and replication calls fail independently so a permission or version difference cannot discard the rest of the health snapshot. Overlapping scheduled and manual collections share one request.

The existing Proxmox API token is reused with read-only access. Without credentials, the page uses safe simulated data. Configure the backup-age and storage thresholds before live rollout, and prefer a secret file for the token. The persisted operations history is included in recovery points.

New endpoints are `GET /api/proxmox/operations` and operator-only `POST /api/proxmox/operations/collect`. Prometheus exports overall health, quorum, failed-task count, backup age, and per-storage utilization. See `deploy/sentinel/PROXMOX-OPERATIONS.md` for permissions, settings, and alert examples.

## Stage 20: Proxmox Backup Server recoverability

The **Backup server** page verifies the other half of the backup path directly against Proxmox Backup Server. It monitors datastore capacity, newest snapshot age, snapshot groups, verification coverage and failures, failed tasks, garbage-collection recency, plus configured sync and prune jobs. This separates “the PVE backup task completed” from “a usable recovery point exists on healthy storage.”

The PBS datastore-usage call is required. Snapshot, task, sync, and prune calls fail independently and appear as collection gaps, preserving the health information Sentinel can still read. Collection runs every 15 minutes by default, retains 30 days of history, and serializes scheduled and manual requests. Without PBS credentials, the dashboard uses clearly labeled simulated data.

Configure a dedicated audit-only PBS API token and prefer `PBS_TOKEN_SECRET_FILE` over a direct secret. Sentinel requires HTTPS, stores its history with owner-only permissions, and includes that history in recovery points. It never downloads backup data or starts destructive PBS operations.

New endpoints are `GET /api/pbs/health` and operator-only `POST /api/pbs/health/collect`. Prometheus exports overall PBS health, snapshot and verification totals, failed tasks, datastore utilization, and backup age. See `deploy/sentinel/PBS.md` for the least-privilege ACL model, settings, and rollout checklist.

## Stage 21: automated recovery drills

The **Recovery** workspace now proves that a retained Sentinel recovery point can be used. Each drill copies the newest verified recovery point into an isolated temporary workspace, verifies the restored checksums, opens the recovered SQLite database with `integrity_check`, parses every JSON state store, retains step-by-step evidence, and then removes the temporary copy. Live Sentinel data is never replaced or modified.

When an external replica is configured, the default `auto` source exercises that replica first and falls back to primary only when necessary. Administrators can require `replica` mode so an unavailable off-host copy fails the drill. Scheduling is disabled by default; after a successful manual run, enable a seven-day schedule with `SENTINEL_RECOVERY_DRILLS_ENABLED=true`.

The drill engine serializes overlapping requests, retains 180 days of results, records failures instead of hiding them, and includes its history in later recovery points. Administrator-only endpoints are `GET /api/recovery/drills` and `POST /api/recovery/drills`. Prometheus exports the latest drill state, age, and consecutive failures. See `deploy/sentinel/RECOVERY.md` for configuration and the boundary between application drills and future isolated VM boot tests.

## Stage 22: isolated Proxmox guest recovery

The **Recovery** workspace can now test a designated VM or LXC backup through a complete Proxmox restore lifecycle. Sentinel finds an unused ID inside a reserved drill range, selects the newest matching backup, restores it powered off to allowlisted scratch storage, removes every restored network interface, boots it for a bounded interval, optionally checks the QEMU guest agent, stops it, and deletes the temporary guest and disks.

This capability uses defense in depth. It remains simulated unless `SENTINEL_REAL_GUEST_DRILLS=true`, all node/storage/source settings are present, and separate `PVE_DRILL_TOKEN_*` credentials are configured. Live runs are administrator-only, manual-only, require an exact confirmation phrase, check VMID availability twice, serialize overlapping requests, and always attempt cleanup after a post-restore failure. A failed cleanup remains visible as a critical operational action and a Prometheus signal.

Use a dedicated non-production drill node, scratch storage, a small canary workload, and a custom scoped Proxmox role. Never give the monitoring token restore/delete permissions. Administrator endpoints are `GET /api/recovery/guest-drills` and `POST /api/recovery/guest-drills`. See `deploy/sentinel/RECOVERY.md` for the rollout and first-run checklist.

## Stage 23: disaster-recovery readiness policy

The **Recovery** workspace now calculates one disaster-recovery readiness score from the controls delivered across the previous recovery stages. Six evidence checks cover recovery-point age against the configured RPO, checksum verification, off-host replication, Sentinel restore-drill age, isolated Proxmox guest-drill age and cleanup state, and live PBS health.

Fresh verified backups and a recent successful Sentinel restore drill are required by default. Replica, guest-drill, and live PBS evidence begin as optional so existing installations can adopt the scorecard without falsely claiming those integrations are configured. Each can be promoted to a required control independently through environment settings. Missing required evidence produces **not ready**; degraded available evidence produces **at risk**; satisfied policy produces **ready**.

The administrator-only `GET /api/recovery/readiness` endpoint returns the score, policy, status, and plain-language evidence for every check. Prometheus exports the overall score and state plus a labeled series for each check, making the same policy suitable for Grafana alerts. See `deploy/sentinel/RECOVERY.md` for policy settings and a recommended rollout sequence.
