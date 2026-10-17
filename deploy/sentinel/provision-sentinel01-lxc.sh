#!/usr/bin/env bash
# Run manually on pve01 AFTER reviewing all variables. No defaults for VMID, storage, or template.
set -euo pipefail
: "${CTID:?Set an unused Proxmox CTID}"
: "${STORAGE:?Set a storage ID supporting rootdir on pve01}"
: "${TEMPLATE:?Set the downloaded Debian 13 template volume ID}"
: "${BRIDGE:?Set the verified management bridge on pve01}"
if [[ "$EUID" -ne 0 ]]; then echo 'Run as root on pve01' >&2; exit 1; fi
if [[ "$(hostname -s)" != 'pve01' ]]; then echo 'Wrong host: expected pve01' >&2; exit 1; fi
if [[ ! "$CTID" =~ ^[1-9][0-9]{2,8}$ ]]; then echo 'Invalid CTID' >&2; exit 1; fi
if pct status "$CTID" >/dev/null 2>&1 || qm status "$CTID" >/dev/null 2>&1; then echo 'CTID already in use' >&2; exit 1; fi
if pvesh get /cluster/nextid --output-format json 2>/dev/null | grep -q '"'; then :; fi
pvesm status | grep -F -- "$STORAGE" >/dev/null || { echo 'Storage not found' >&2; exit 1; }
pvesm list "$STORAGE" --content rootdir >/dev/null || { echo 'Storage does not support rootdir' >&2; exit 1; }
pvesm list "${TEMPLATE%%:*}" --content vztmpl | grep -F -- "$TEMPLATE" >/dev/null || { echo 'Template not found' >&2; exit 1; }
ip link show "$BRIDGE" >/dev/null || { echo 'Bridge not found' >&2; exit 1; }
echo "PROPOSED: pct create $CTID $TEMPLATE --hostname sentinel01 --ostype debian --unprivileged 1 --cores 2 --memory 4096 --swap 512 --rootfs $STORAGE:32 --net0 name=eth0,bridge=$BRIDGE,ip=dhcp,firewall=1 --onboot 1 --features nesting=0,keyctl=0 --start 0"
echo 'Container will NOT be created until you set APPLY=YES.'
if [[ "${APPLY:-}" != YES ]]; then exit 0; fi
read -r -p "Type sentinel01 to confirm provisioning: " confirmation
[[ "$confirmation" == sentinel01 ]] || { echo 'Cancelled'; exit 1; }
pct create "$CTID" "$TEMPLATE" --hostname sentinel01 --ostype debian --unprivileged 1 --cores 2 --memory 4096 --swap 512 --rootfs "$STORAGE:32" --net0 "name=eth0,bridge=$BRIDGE,ip=dhcp,firewall=1" --onboot 1 --features nesting=0,keyctl=0 --start 0
echo "Created stopped CTID $CTID; review pct config $CTID, then start manually."
