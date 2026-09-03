# SentinelLab reliability test bed

Extensible release-readiness application for web frontends, backend APIs, containers, and LiveNX/LiveWire integration paths.

## Run

```bash
pnpm install
pnpm dev
```

Open `http://localhost:5173`. The API listens on port 4100.

SentinelLab stores tests and run history in `data/sentinel.db`. Set `DATABASE_PATH` to use a different SQLite location. Production builds are served by the API process after running `pnpm build` and `pnpm start`.

Simulation mode is the safe default. Real HTTP(S) checks require an explicit `simulate: false` in `POST /api/runs`; timeouts are capped at 30 seconds. Credentials are intentionally not stored in this prototype.

Included surfaces: browser journeys, API contracts, container readiness, LiveNX telemetry freshness, LiveWire LiveFlow/OpenTelemetry export, release scoring, and run history.

## Verify

```bash
pnpm test
pnpm build
```
