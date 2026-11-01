#!/usr/bin/env bash
# Fetch a reviewed Git ref and install it as the next versioned release.
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo 'Run as root inside sentinel01.' >&2
  exit 1
fi
: "${SENTINEL_REF:?Set SENTINEL_REF to a reviewed commit SHA, tag, or remote branch}"

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$(cd "$script_dir/../.." && pwd)"
cd "$source_dir"

if [[ -n "$(git status --porcelain)" ]]; then
  echo 'Source checkout has local changes; refusing to overwrite them.' >&2
  exit 1
fi

git fetch --tags --prune origin
git checkout --detach "$SENTINEL_REF"
START_SENTINEL=YES exec bash deploy/sentinel/install-sentinel-native.sh
