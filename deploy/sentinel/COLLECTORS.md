# Sentinel remote collectors

1. Sign in to central Sentinel as an administrator and open **Sites**.
2. Enroll a collector with its site, source type, and reporting interval.
3. Copy the displayed token immediately. Sentinel stores only its SHA-256 hash and cannot display it again.
4. On the remote Docker or Proxmox site, copy `docker-compose.collector.yml.example` to `docker-compose.collector.yml` and set `SENTINEL_URL` plus `SENTINEL_COLLECTOR_TOKEN` in a protected `.env` file.
5. Configure a least-privilege Proxmox API token. For Docker discovery, the example places a restricted socket proxy on an internal network; the collector never receives the host socket directly.
6. Start the collector and confirm that its state becomes **online** on the Sites page.

```bash
docker compose -f docker-compose.collector.yml up -d
docker compose -f docker-compose.collector.yml logs -f
```

Collectors initiate outbound HTTPS connections only. Permit access from each site to the central `/api/collector/v1/snapshots` endpoint and do not expose a listening port on collector hosts. The local outbox retains up to 100 snapshots during a central outage and sends them in order after connectivity returns.

The socket proxy is intentionally limited to Docker `INFO` and `CONTAINERS` GET requests. Never publish its port or attach unrelated containers to its internal network. Remove the proxy service and `DOCKER_HOST_URL` from a Proxmox-only collector deployment.

A collector becomes stale after three missed reporting intervals, with a minimum grace period of 90 seconds. Alert on `sentinel_collectors_stale > 0`. Rotate a token from the Sites page whenever a token may have been exposed; the previous token stops working immediately.
