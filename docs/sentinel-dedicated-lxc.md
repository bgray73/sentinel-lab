# Sentinel on a dedicated Proxmox LXC

This is the approved read-only pilot design for `sentinel01` on `pve01`.
Provisioning remains deliberately operator-controlled: the scripts validate
inputs, print the proposed action first, and never guess site-specific values.

## 1. Create the LXC

Use the profile and gates in `deploy/sentinel/SENTINEL01-PLAN.md`. The guarded
script requires a real CTID, storage ID, Debian 13 template volume, and verified
bridge:

```bash
CTID=... STORAGE=... TEMPLATE=... BRIDGE=... \
  bash deploy/sentinel/provision-sentinel01-lxc.sh
```

That command is a dry run. To create the stopped unprivileged LXC after
reviewing the printed command:

```bash
CTID=... STORAGE=... TEMPLATE=... BRIDGE=... APPLY=YES \
  bash deploy/sentinel/provision-sentinel01-lxc.sh
```

Review `pct config CTID` before starting the container.

## 2. Prepare Debian

Inside `sentinel01`, install Git, CA certificates, build tools, and Node.js 24
LTS from a trusted package source. Verify that `node` resolves to the intended
binary and reports at least version 22.13:

```bash
node --version
command -v node
```

Clone the repository into `/opt/sentinel/source` and check out a reviewed commit
SHA rather than an unpinned moving branch:

```bash
git clone https://github.com/bgray73/sentinel-lab.git /opt/sentinel/source
cd /opt/sentinel/source
git checkout --detach REVIEWED_COMMIT_SHA
bash deploy/sentinel/install-sentinel-native.sh
```

The installer runs the test suite and production build, creates the restricted
`sentinel` service account, installs a versioned release, writes a hardened
systemd unit, and leaves the service stopped on its first run.

## 3. Configure read-only Proxmox access

Create a dedicated Proxmox API token with `PVEAuditor` at `/`. Do not reuse a
root credential or a recovery-drill token. Edit `/etc/sentinel/sentinel.env`:

```ini
PVE_URL=https://PVE_MANAGEMENT_ADDRESS:8006/api2/json
PVE_TOKEN_ID=sentinel@pve!readonly
PVE_TOKEN_SECRET_FILE=/etc/sentinel/secrets/pve-token
```

Write only the token value to `/etc/sentinel/secrets/pve-token`, then set:

```bash
chown root:sentinel /etc/sentinel/secrets/pve-token
chmod 0640 /etc/sentinel/secrets/pve-token
```

Trust the Proxmox certificate chain with `NODE_EXTRA_CA_CERTS` when a private CA
is used. Do not disable TLS verification.

## 4. Start and validate

The native environment binds Sentinel to `127.0.0.1:4100`. Start it and run the
read-only validation:

```bash
systemctl start sentinel.service
bash /opt/sentinel/source/deploy/sentinel/validate-sentinel-native.sh
```

For the pilot, reach it from a workstation through an SSH tunnel:

```bash
ssh -L 4100:127.0.0.1:4100 root@sentinel01
```

Then open `http://127.0.0.1:4100`. Keep `SENTINEL_AUTH_MODE=disabled` only while
the service is loopback-only. Before direct LAN access, place it behind the
planned authenticated Caddy/Authentik ingress, bind to the approved LXC address,
and restrict the LXC firewall to the proxy source.

Validate simulated inventory first. Then request live read-only inventory and
compare node, VM, and LXC counts with the Proxmox UI. Confirm
`/api/workloads/actions/status` reports `enabled:false`.

## 5. Upgrade and rollback

Upgrade only to a reviewed commit or tag from a clean source checkout:

```bash
cd /opt/sentinel/source
SENTINEL_REF=REVIEWED_COMMIT_SHA \
  bash deploy/sentinel/upgrade-sentinel-native.sh
```

Each upgrade keeps the prior release. To swap back and health-check it:

```bash
bash /opt/sentinel/source/deploy/sentinel/rollback-sentinel-native.sh
```

The rollback script restores the original release automatically if the previous
release fails its health check. Release directories are retained; cleanup is a
separate reviewed maintenance task.

## 6. Persistence and recovery

Back up `/var/lib/sentinel` and protect `/etc/sentinel` as secret-bearing
configuration. Include the LXC in PBS once PBS storage and restore testing are
available. A snapshot is useful before an upgrade but is not an off-host backup.

Keep Jev, notifications, recovery drills, ServiceNow writes, network incident
automation, and Docker lifecycle actions disabled until the read-only pilot is
stable and each capability is enabled separately.
