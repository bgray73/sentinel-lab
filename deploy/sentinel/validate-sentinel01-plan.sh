#!/usr/bin/env bash
# Offline pre-deployment validation. Does not contact Proxmox or create resources.
set -euo pipefail
cd "$(dirname "$0")/../.."
bash -n deploy/sentinel/provision-sentinel01-lxc.sh
bash -n deploy/sentinel/validate-sentinel01-plan.sh
test -f docs/sentinel-dedicated-lxc.md
test -f deploy/sentinel/.env.example
test -f deploy/sentinel/docker-compose.yml
grep -q 'SENTINEL_ENABLE_WORKLOAD_ACTIONS=false' deploy/sentinel/.env.example
grep -q 'SENTINEL_ENABLE_WORKLOAD_ACTIONS' deploy/sentinel/docker-compose.yml
grep -q -- '--unprivileged 1' deploy/sentinel/provision-sentinel01-lxc.sh
grep -q -- '--start 0' deploy/sentinel/provision-sentinel01-lxc.sh
grep -q 'APPLY:-' deploy/sentinel/provision-sentinel01-lxc.sh
echo 'Sentinel LXC plan passes offline safety checks; no hosts contacted.'
