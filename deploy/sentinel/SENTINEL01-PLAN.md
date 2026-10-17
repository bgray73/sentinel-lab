# Sentinel dedicated LXC — predeployment worksheet

**Status:** All physical Proxmox hosts are pending deployment. This worksheet deliberately contains no guessed addresses, CTIDs, disk pool names, or bridge IDs. The scripts in this PR are not an installation.

| Setting | Proposed / pending |
| --- | --- |
| Proxmox host | pve01 — first Dell R640 |
| Guest name | sentinel01 |
| OS | Debian 13 LXC template (confirm availability on deployment) |
| CTID | TBD; check cluster allocation |
| vCPU | 2 |
| Memory / swap | 4096 MiB / 512 MiB |
| Root disk | 32 GiB on SSD-backed rootdir-capable storage (ID TBD) |
| LXC privilege | Unprivileged |
| Nesting / keyctl | Disabled |
| Management bridge | TBD after pve01 network setup |
| IP | DHCP initially; reserve management address later |
| Firewall | Proxmox CT NIC firewall enabled; rules must be separately defined and tested |
| Application | Native Node.js, no Docker socket |
| Authentication | Trusted proxy before any remote access |
| Workload actions | Disabled |

## Before any provisioning

1. Install Proxmox on pve01, pve02, and pve03, validate storage and management network, and join the cluster.
2. Confirm backups and restore destination. Reserve a CTID not used by any cluster guest.
3. Run on pve01: `pvesm status`, `ip -br link`, `pveam list local`, `pvesh get /cluster/nextid`.
4. Confirm that the selected template volume exists and the storage accepts container root disks.
5. From a local clone of this repository, run `bash deploy/sentinel/validate-sentinel01-plan.sh`.
6. Supply `CTID`, `STORAGE`, `TEMPLATE`, and `BRIDGE` to the provisioning script. The first run prints a dry-run plan only.
7. After checking the plan and networking rules, explicitly set `APPLY=YES` and enter the interactive confirmation to create the **stopped** container.
8. Review `pct config CTID` before starting. Install Sentinel according to `docs/sentinel-dedicated-lxc.md`.

## Hold points

Do not deploy the LXC until host storage and network are confirmed. Do not grant Docker socket access, enable workload actions, open port 4100 to the LAN, or configure write-capable Proxmox tokens as part of initial installation.
