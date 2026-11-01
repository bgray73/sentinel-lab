#!/usr/bin/env bash
# Build and install the current checkout as a versioned native Sentinel release.
set -euo pipefail

if [[ "$EUID" -ne 0 ]]; then
  echo 'Run as root inside the dedicated sentinel01 LXC.' >&2
  exit 1
fi

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source_dir="$(cd "$script_dir/../.." && pwd)"
node_bin="$(command -v node || true)"

if [[ -z "$node_bin" ]]; then
  echo 'Node.js is required. Install Node.js 24 LTS, then rerun.' >&2
  exit 1
fi
node_version="$($node_bin -p 'process.versions.node')"
node_major="${node_version%%.*}"
if (( node_major < 22 )); then
  echo "Node.js 22.13 or newer is required; found $node_version." >&2
  exit 1
fi
if ! command -v corepack >/dev/null 2>&1; then
  echo 'Corepack is required to activate the repository-pinned pnpm version.' >&2
  exit 1
fi

if ! getent group sentinel >/dev/null; then
  groupadd --system sentinel
fi
if ! getent passwd sentinel >/dev/null; then
  useradd --system --gid sentinel --home-dir /var/lib/sentinel \
    --shell /usr/sbin/nologin sentinel
fi

install -d -o sentinel -g sentinel -m 0750 /var/lib/sentinel
install -d -o root -g root -m 0755 /opt/sentinel /opt/sentinel/releases
install -d -o root -g sentinel -m 0750 /etc/sentinel /etc/sentinel/secrets

corepack enable
corepack prepare pnpm@10.15.1 --activate
cd "$source_dir"
pnpm install --frozen-lockfile
pnpm test
pnpm build:production

commit="$(git rev-parse --short=12 HEAD 2>/dev/null || printf 'source')"
release_id="$(date -u +%Y%m%dT%H%M%SZ)-$commit"
release_dir="/opt/sentinel/releases/$release_id"
if [[ -e "$release_dir" ]]; then
  echo "Release already exists: $release_dir" >&2
  exit 1
fi
install -d -o root -g root -m 0755 "$release_dir"
cp -a package.json pnpm-lock.yaml pnpm-workspace.yaml dist server-dist "$release_dir/"
cd "$release_dir"
pnpm install --prod --frozen-lockfile
chown -R root:root "$release_dir"
chmod -R go-w "$release_dir"

old_release=''
if [[ -L /opt/sentinel/current ]]; then
  old_release="$(readlink -f /opt/sentinel/current)"
fi
if [[ -n "$old_release" && -d "$old_release" ]]; then
  ln -sfn "$old_release" /opt/sentinel/previous.next
  mv -Tf /opt/sentinel/previous.next /opt/sentinel/previous
fi
ln -sfn "$release_dir" /opt/sentinel/current.next
mv -Tf /opt/sentinel/current.next /opt/sentinel/current

sed "s|@NODE_BIN@|$node_bin|g" "$script_dir/sentinel.service" \
  > /etc/systemd/system/sentinel.service.new
chmod 0644 /etc/systemd/system/sentinel.service.new
mv -f /etc/systemd/system/sentinel.service.new /etc/systemd/system/sentinel.service

if [[ ! -f /etc/sentinel/sentinel.env ]]; then
  install -o root -g sentinel -m 0640 \
    "$script_dir/sentinel.env.native.example" /etc/sentinel/sentinel.env
  echo 'Created /etc/sentinel/sentinel.env; configure it before starting Sentinel.'
fi

systemctl daemon-reload
systemctl enable sentinel.service >/dev/null

if systemctl is-active --quiet sentinel.service; then
  systemctl restart sentinel.service
elif [[ "${START_SENTINEL:-}" == YES ]]; then
  systemctl start sentinel.service
else
  echo 'Sentinel is installed but remains stopped.'
  echo 'Configure /etc/sentinel/sentinel.env and the PVE token file, then run:'
  echo '  systemctl start sentinel.service'
  exit 0
fi

for _ in {1..15}; do
  if "$node_bin" -e "fetch('http://127.0.0.1:4100/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
    echo "Sentinel $release_id is healthy on loopback port 4100."
    exit 0
  fi
  sleep 1
done

echo 'Sentinel did not become healthy; inspect: journalctl -u sentinel -n 100' >&2
exit 1
