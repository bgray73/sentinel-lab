#!/usr/bin/env bash
# Read-only post-install validation for the native sentinel01 service.
set -euo pipefail

current="$(readlink -f /opt/sentinel/current)"
test -d "$current"
test -f "$current/server-dist/index.js"
test -f /etc/sentinel/sentinel.env
systemctl is-enabled --quiet sentinel.service
systemctl is-active --quiet sentinel.service

node -e "fetch('http://127.0.0.1:4100/api/health').then(async r=>{if(!r.ok)process.exit(1); console.log(await r.text())}).catch(error=>{console.error(error);process.exit(1)})"
node -e "fetch('http://127.0.0.1:4100/api/workloads/actions/status').then(async r=>{const body=await r.json();if(!r.ok||body.enabled!==false)process.exit(1);console.log(JSON.stringify(body))}).catch(error=>{console.error(error);process.exit(1)})"

echo "Native Sentinel validation passed for $current"
