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
