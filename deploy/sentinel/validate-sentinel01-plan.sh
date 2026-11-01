#!/usr/bin/env bash
# Offline deployment validation. Does not contact Proxmox or create resources.
set -euo pipefail
cd "$(dirname "$0")/../.."

scripts=(
  deploy/sentinel/provision-sentinel01-lxc.sh
  deploy/sentinel/install-sentinel-native.sh
  deploy/sentinel/upgrade-sentinel-native.sh
  deploy/sentinel/rollback-sentinel-native.sh
  deploy/sentinel/validate-sentinel-native.sh
  deploy/sentinel/validate-sentinel01-plan.sh
)
for script in "${scripts[@]}"; do
  bash -n "$script"
done

test -f docs/sentinel-dedicated-lxc.md
test -f deploy/sentinel/SENTINEL01-PLAN.md
test -f deploy/sentinel/sentinel.service
test -f deploy/sentinel/sentinel.env.native.example
grep -q 'SENTINEL_LISTEN_ADDRESS=127.0.0.1' deploy/sentinel/sentinel.env.native.example
grep -q 'SENTINEL_ENABLE_WORKLOAD_ACTIONS=false' deploy/sentinel/sentinel.env.native.example
grep -q 'SENTINEL_AUTH_MODE=disabled' deploy/sentinel/sentinel.env.native.example
grep -q 'PVE_TOKEN_SECRET_FILE=/etc/sentinel/secrets/pve-token' deploy/sentinel/sentinel.env.native.example
grep -q 'NoNewPrivileges=true' deploy/sentinel/sentinel.service
grep -q 'ReadWritePaths=/var/lib/sentinel' deploy/sentinel/sentinel.service
grep -q -- '--unprivileged 1' deploy/sentinel/provision-sentinel01-lxc.sh
grep -q -- '--start 0' deploy/sentinel/provision-sentinel01-lxc.sh
grep -q 'APPLY:-' deploy/sentinel/provision-sentinel01-lxc.sh

echo 'Sentinel deployment plan passes offline safety checks; no hosts contacted.'
