# Sentinel on a dedicated Proxmox LXC

This is a deployment plan, **not an executed installation**. Start with read-only Proxmox discovery. No Docker socket or privileged container features are required.

## Suggested LXC profile

- Name: `sentinel01`; Debian 12 or 13; unprivileged; start at boot
- 2 vCPU, 4 GiB RAM, 32 GiB SSD root disk (increase if retention grows)
- One management-network NIC; reserve an address in DHCP or assign a documented static address
- Disable nesting and keyctl unless later justified by an explicitly reviewed container runtime
- Allow outbound TCP 8006 to the Proxmox API and necessary package repositories; do not expose TCP 4100 to the LAN without authenticated ingress

Select the host node and VMID after checking available cluster resources and VMID allocation. Use an approved Debian LXC template. For initial installation, prefer native Node.js to avoid nesting Docker inside LXC.

## Install and build inside the LXC

Install Node.js 24 LTS, Git, build tools, and pnpm 10.15.1 using trusted package sources. Clone the repository at an approved release or commit, then run:

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm build:production
```

Create a dedicated non-login service user and persistent `/var/lib/sentinel` directory owned by that user. Store credentials outside the Git checkout, readable only by the service user. Set `DATABASE_PATH`, `SENTINEL_DATA_FILE`, and other persistent file variables to paths under `/var/lib/sentinel` as appropriate. Use systemd to run `node server-dist/index.js` from the checkout or release directory with `NODE_ENV=production`, `PORT=4100`, `SENTINEL_ENABLE_WORKLOAD_ACTIONS=false`, and `SENTINEL_AUTH_MODE=disabled` only when the service is bound to loopback and accessed via a trusted authenticated proxy or SSH tunnel.

**Important:** The Node server's actual bind behavior must be confirmed before opening any firewall access. The Docker Compose loopback binding does not apply to a native Node service. Configure network isolation at the LXC firewall and host layer.

## Proxmox access

Create a dedicated Proxmox API token with `PVEAuditor` permissions at `/`. Configure `PVE_URL`, `PVE_TOKEN_ID`, and `PVE_TOKEN_SECRET_FILE` with the token secret stored outside source control. Trust the Proxmox API certificate chain, using `NODE_EXTRA_CA_CERTS` for a private CA if necessary. Do not disable TLS verification.

## Validation and rollback

1. Confirm `GET /api/health` returns HTTP 200 from inside the LXC.
2. Confirm `GET /api/workloads` returns clearly labeled simulated inventory.
3. Confirm `GET /api/workloads?simulate=false` returns expected Proxmox VMs and LXCs; compare counts against the cluster UI.
4. Confirm `GET /api/workloads/actions/status` returns `enabled:false`.
5. Verify LXC restart, persistent data, disk usage, and access restrictions.
6. Snapshot or back up the LXC before upgrading. Roll back to the prior known-good release and restore persistent data only if required.

Do not enable Docker lifecycle actions during this phase. An LXC snapshot is not a substitute for an off-host backup.
