# Jev-assisted incident triage

Stage 33 adds a manual, advisory incident-domain classifier to the Alerts page.
It does not rank root-cause candidates yet, ingest Loki logs, or perform remediation.
Monitoring, notifications, and existing topology correlations remain independent.

## Default behavior

Without live configuration, Analyze with Jev returns a clearly labeled simulation:
`insufficient_evidence`, no confidence, and no outbound request. It is a demo of
the workflow, not a model prediction. Results are transient and not persisted.

## Enable only after reviewing external data disclosure

1. Configure Sentinel's authenticated proxy and administrator groups first.
   Authentication-disabled development mode grants local admin access; never
   expose that mode to an untrusted network.
2. Obtain a TypeSafe API key from https://console.typesafe.ai and store it outside Git.
3. Set `TYPESAFE_API_KEY_FILE=/run/secrets/typesafe_api_key` (preferred) or
   `TYPESAFE_API_KEY` in the server environment. Do not put the key in frontend
   variables, screenshots, chat, or committed files.
4. Explicitly set `SENTINEL_REAL_JEV=true` and restart Sentinel.
5. In Alerts, select an active incident and click Analyze with Jev as an administrator.

For Docker Compose, add these values to the deployment environment. If using
`TYPESAFE_API_KEY_FILE`, also mount that file read-only into the container at the
configured path using a local Compose override or Docker secret; setting a host
path alone does not mount it. Ensure the container user can read the file.

The server calls `https://api.typesafe.ai/v1/systemone` using `jev-latest` and a
Choice question. Only source category, severity, lifecycle status, check protocol,
and latest check status leave Sentinel. Free text, incident IDs, names, addresses,
targets, timestamps, logs, and credentials are excluded rather than scrubbed with
best-effort regexes. Provider charges and data-handling terms apply; review them
before enabling. No live request is needed for development or CI tests.

## Interpretation and limits

Categories are network, storage, compute, application, and insufficient_evidence.
The limited initial payload often cannot distinguish storage, compute, or application
causes; do not treat missing detail as proof. Confidence below 0.7 yields
insufficient_evidence. This initial threshold is not calibrated to your lab and all
results require human review, even high-confidence ones.

Requests have a ten-second timeout, no automatic retries, no redirects, a 32 KiB
response cap, and a 30-second process-wide cooldown (including failures). Restarting
the process resets the cooldown; multiple replicas have independent limits. Set a
provider-side spending limit as well. Provider errors are not returned verbatim.
An API failure never falls back to a result labeled live or changes incident state.

API: `GET /api/integrations/jev` reports non-secret configuration; administrator-only
`POST /api/integrations/jev/incidents/:id/analyze` analyzes a stored active incident.
Client-supplied prompts or evidence are not accepted. Disable by unsetting
`SENTINEL_REAL_JEV` or setting it to `false`, then restart.

Official contract: https://docs.typesafe.ai/introduction/quickstart
