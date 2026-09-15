# Capacity forecasting

Stage 25 projects when CPU, memory, or disk utilization may cross a configurable threshold. It uses Sentinel's retained 30-day telemetry and appears on the **Performance** page.

## How it behaves

- A current reading already at the threshold is `critical` immediately.
- A sustained upward trend reaching the threshold within 7 days is `critical`.
- A trend reaching the threshold within 30 days is `warning`.
- A slower upward trend is `healthy`; flat or falling usage is `stable`.
- Sentinel reports `insufficient` instead of extrapolating until it has at least 7 daily samples spanning 6 days.

CPU is a utilization projection, not a claim that compute is physically exhausted. Short-lived spikes can reduce confidence. Memory and disk projections are usually better planning signals.

## Configuration

| Variable | Default | Purpose |
| --- | ---: | --- |
| `SENTINEL_CAPACITY_THRESHOLD_PERCENT` | `90` | Utilization target used by the projection |
| `SENTINEL_CAPACITY_FORECAST_HORIZON_DAYS` | `30` | Forward projection shown in the UI |
| `SENTINEL_CAPACITY_WARNING_DAYS` | `30` | Warning window |
| `SENTINEL_CAPACITY_CRITICAL_DAYS` | `7` | Critical window |
| `SENTINEL_CAPACITY_MIN_SAMPLES` | `7` | Minimum non-empty daily buckets |
| `SENTINEL_CAPACITY_MIN_SPAN_DAYS` | `6` | Minimum time covered by those samples |

After changing policy values, restart Sentinel. Keep at least 30 days of telemetry and avoid reducing the minimums unless the workload is highly predictable.

## API and Prometheus

- `GET /api/capacity/forecasts` returns the policy, summary, per-resource projections, slope, fit, and confidence.
- `/metrics` exports current utilization, actionable days-to-threshold values, and forecast state labels.

Create Prometheus alerts from `sentinel_capacity_days_to_threshold` only after observing the forecasts in your environment. The API and dashboard remain useful before alerting is enabled.

## Forecast-driven incidents

Stage 26 can reconcile qualified capacity risks through the normal Sentinel incident and notification pipeline. It is disabled by default. Enable it only after the telemetry baseline has matured and the Performance page has been reviewed:

```dotenv
SENTINEL_CAPACITY_ALERTS_ENABLED=true
SENTINEL_CAPACITY_ALERT_INTERVAL_SECONDS=300
SENTINEL_CAPACITY_ALERT_COOLDOWN_SECONDS=3600
SENTINEL_CAPACITY_ALERT_MIN_CONFIDENCE=high
```

Projected warning and critical conditions must meet the configured confidence level. An actual current reading at or above the utilization threshold always qualifies, even before a full trend baseline exists. Each resource and metric receives a stable incident key, so scheduled evaluations update the same incident, preserve acknowledgement, honor the notification cooldown, and resolve it when the risk clears or falls below policy.

Delivery reuses the generic webhook, Slack, Teams, email, and ServiceNow destinations in `INTEGRATIONS.md`. With real notifications disabled, the incident and delivery lifecycle remains simulated and retained locally. `GET /api/capacity/alerts` reports scheduler state and active incidents; administrators can use `POST /api/capacity/alerts/evaluate` for an immediate evaluation.
