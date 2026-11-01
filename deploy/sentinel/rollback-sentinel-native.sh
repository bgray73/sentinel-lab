#!/usr/bin/env bash
# Swap current and previous releases, then verify health; revert on failure.
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo 'Run as root inside sentinel01.' >&2
  exit 1
fi
if [[ ! -L /opt/sentinel/current || ! -L /opt/sentinel/previous ]]; then
  echo 'Both current and previous release links are required.' >&2
  exit 1
fi

current="$(readlink -f /opt/sentinel/current)"
previous="$(readlink -f /opt/sentinel/previous)"
if [[ ! -d "$current" || ! -d "$previous" || "$current" == "$previous" ]]; then
  echo 'Release links are invalid or identical.' >&2
  exit 1
fi

switch_release() {
  local next_current="$1"
  local next_previous="$2"
  ln -sfn "$next_current" /opt/sentinel/current.next
  mv -Tf /opt/sentinel/current.next /opt/sentinel/current
  ln -sfn "$next_previous" /opt/sentinel/previous.next
  mv -Tf /opt/sentinel/previous.next /opt/sentinel/previous
}

switch_release "$previous" "$current"
systemctl restart sentinel.service

for _ in {1..15}; do
  if node -e "fetch('http://127.0.0.1:4100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "Rollback succeeded: $previous"
    exit 0
  fi
  sleep 1
done

echo 'Rolled-back release failed health validation; restoring the original release.' >&2
switch_release "$current" "$previous"
systemctl restart sentinel.service
exit 1
