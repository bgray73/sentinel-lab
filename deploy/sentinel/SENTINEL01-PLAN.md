# Sentinel dedicated LXC — predeployment worksheet

**Status:** All physical Proxmox hosts are pending deployment. UCG Fiber VLANs are already configured according to the owner; firewall reachability and switch/host VLAN paths remain unverified. Proxmox management is VLAN 20 (10.10.20.0/24). This worksheet deliberately contains no guessed addresses, CTIDs, disk pool names, or bridge IDs. The scripts in this PR are not an installation.

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
| Network role | VLAN 41 infrastructure services (10.10.41.0/24), per UCG Fiber screenshot and Proxmox topology |
| Management bridge | TBD after pve01 network setup; confirm VLAN 41 tagging or access bridge |
| IP | DHCP initially in 10.10.41.0/24; reserve address later, gateway not yet verified |
| Firewall | Proxmox CT NIC firewall enabled; rules must be separately defined and tested |
| Application | Native Node.js, no Docker socket |
| Authentication | Trusted proxy before any remote access |
| Workload actions | Disabled |

The [Proxmox deployment contract](https://github.com/bgray73/proxmox_ve_installation/blob/feature/sentinel-deployment-contract/docs/SENTINEL.md) owns infrastructure placement and the build order. Sentinel owns application configuration. Both repos must be reviewed together when the deployment contract changes.

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
