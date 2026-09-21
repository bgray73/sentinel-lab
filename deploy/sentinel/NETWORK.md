# Network interface health runbook

Stage 27 polls switch and router interfaces through the Prometheus SNMP Exporter already used by hardware discovery. Collection is read-only. Sentinel sends the configured target address, module, and authentication-profile name to the exporter; it never stores device SNMP credentials.

## Monitored signals

- Administrative and operational state from `ifAdminStatus` and `ifOperStatus`
- Interface name, description, alias, speed, and last-change time
- Receive and transmit rates from 64-bit high-capacity octet counters, with 32-bit fallback
- Utilization based on the busier traffic direction and negotiated speed
- Input/output errors and discards per second
- Unexpected operational-state transitions while a port is administratively enabled

An administratively disabled interface has `disabled` health. An enabled interface that is not operational is critical. Utilization, combined error/discard rate, and repeated transitions are evaluated against configurable thresholds.

## Safe rollout

1. Keep `SENTINEL_REAL_NETWORK=false` and review the simulated Network workspace.
2. Configure SNMPv3 `authPriv` in the exporter and validate its `/snmp` response directly from the Sentinel network.
3. Add only switches and routers to `SENTINEL_SNMP_TARGETS`, using stable IDs that match the hardware inventory and CMDB device IDs.
4. Set `SENTINEL_REAL_NETWORK=true` and restart Sentinel.
5. Wait for two successful polls before evaluating rates. The first poll establishes a counter baseline.
6. Review expected disabled ports, interface aliases, and thresholds before creating alerts.

Example target configuration:

```dotenv
SNMP_EXPORTER_URL=http://snmp-exporter:9116
SENTINEL_SNMP_TARGETS=[{"id":"core-01","name":"Core switch","target":"10.20.0.2","category":"switch","module":"if_mib","auth":"sentinel_v3"}]
SENTINEL_REAL_NETWORK=true
```

## Settings

| Variable | Default | Purpose |
| --- | ---: | --- |
| `SENTINEL_NETWORK_INTERVAL_SECONDS` | `60` | Poll interval |
| `SENTINEL_NETWORK_TIMEOUT_MS` | `8000` | Per-target exporter timeout |
| `SENTINEL_NETWORK_UTIL_WARNING_PERCENT` | `70` | Utilization warning threshold |
| `SENTINEL_NETWORK_UTIL_CRITICAL_PERCENT` | `90` | Utilization critical threshold |
| `SENTINEL_NETWORK_ERROR_WARNING_PER_SECOND` | `1` | Combined error/discard warning rate |
| `SENTINEL_NETWORK_ERROR_CRITICAL_PER_SECOND` | `100` | Combined error/discard critical rate |
| `SENTINEL_NETWORK_FLAP_WINDOW_MINUTES` | `15` | Recent-transition evaluation window |
| `SENTINEL_NETWORK_FLAP_WARNING_COUNT` | `3` | Transition count that produces a warning |

The state file is `/var/lib/sentinel/network.json` in the provided compose deployments. It retains the previous counters, latest snapshot, and up to 30 days of bounded link-transition history. Partial target failures preserve successful devices and appear in the UI and status response.

## Operations and metrics

- `GET /api/network/interfaces` returns collector status and the current snapshot.
- `POST /api/network/interfaces/collect` requests an immediate poll and requires operator access.
- `/metrics` exposes `sentinel_network_interface_health`, `sentinel_network_interface_utilization_percent`, `sentinel_network_interface_errors_per_second`, and `sentinel_network_interface_flaps_recent`.

If all targets fail, confirm exporter reachability, target ACLs, the module name, and the SNMPv3 profile. A device reboot or counter wrap creates a fresh rate baseline instead of a negative spike.

## Incident automation

Stage 28 can convert each warning or critical interface into a stable, deduplicated incident. Incident keys are derived from the stable device ID and interface index, so interface aliases may change without creating duplicates. A healthy evaluation resolves the active incident automatically. Acknowledgement state, reminder cooldowns, simulated or live notification channels, and ServiceNow ticket routing reuse Sentinel's normal incident pipeline.

Keep the feature disabled during initial baseline review:

```dotenv
SENTINEL_NETWORK_ALERTS_ENABLED=false
SENTINEL_NETWORK_ALERT_INTERVAL_SECONDS=60
SENTINEL_NETWORK_ALERT_COOLDOWN_SECONDS=3600
```

Before enabling it, confirm that unused ports are administratively down, aliases identify important uplinks, and the utilization/error/flap thresholds match the fabric. Then enable the feature and use `POST /api/network/alerts/evaluate` for a controlled first evaluation. `GET /api/network/alerts` reports automation state and active network incidents. Prometheus exports `sentinel_network_alerts_enabled`, `sentinel_network_alert_active_incidents`, and `sentinel_network_alert_monitor_error`.

## CMDB links

Stage 29 reconciles each network port as a `network_interface` CI. The switch/router device contains the interface. An alias such as `pve-01 40G uplink` links to a uniquely named `pve-01` Proxmox node; aliases that contain two endpoint names or no exact endpoint name remain unlinked. Use the CMDB relationship API to record verified connections where aliases are missing. Discovered network relationships are refreshed after a complete poll, while operator-created relationships remain intact. An incomplete poll retains the previous inferred links until the next complete reconciliation.

Stage 31 exposes the downstream blast radius for an active interface incident in `GET /api/topology`. Each correlation includes `affectedAssets` with the asset ID, type, health, hop distance, full path, and whether the path contains an inferred relationship, plus an `impact` count by resource category. Treat this as a dependency assessment rather than proof of outage; confirm redundant uplinks and service checks before escalating the port as the root cause.
