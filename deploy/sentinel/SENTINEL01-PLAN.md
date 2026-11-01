# Sentinel dedicated LXC — deployment worksheet

## Current environment

Two Dell Proxmox servers are active. A Lenovo system is the third cluster
member for quorum; confirm whether it is a full PVE node or quorum-only role
before using it as an application target. Sentinel remains assigned to
`pve01`, not the Lenovo system.

| Setting | Approved / pending |
| --- | --- |
| Proxmox host | `pve01`; verify the live node name before provisioning |
| Guest name | `sentinel01` |
| OS | Debian 13 unprivileged LXC |
| CTID | Pending `pvesh get /cluster/nextid` and operator approval |
| vCPU | 2 |
| Memory / swap | 4096 MiB / 512 MiB |
| Root disk | 32 GiB on verified SSD-backed `rootdir` storage |
| Nesting / keyctl | Disabled |
| Network role | Planned infrastructure-services VLAN 41 (`10.10.41.0/24`) |
| Bridge and tag | Pending verification on `pve01` |
| Address | DHCP initially; create a reservation after first boot |
| Application | Native Node.js; no Docker socket |
| Proxmox access | Dedicated read-only `PVEAuditor` API token |
| Authentication | Loopback/SSH tunnel first; authenticated proxy before LAN access |
| Workload actions | Disabled |

## Provisioning gates

1. On `pve01`, verify `pvecm status` reports a quorate cluster and confirm the
   identities and roles of both Dell nodes and the Lenovo member.
2. Verify the VLAN 41 path from the selected bridge through the UCG Fiber.
   Do not infer the bridge name or VLAN behavior from documentation alone.
3. Run `pvesm status`, `pveam list local`, `ip -br link`, and
   `pvesh get /cluster/nextid`.
4. Confirm that the selected storage supports `rootdir`, the Debian 13 template
   exists, and an LXC/PBS recovery destination is available.
5. Run `bash deploy/sentinel/validate-sentinel01-plan.sh` from a reviewed clone.
6. Supply `CTID`, `STORAGE`, `TEMPLATE`, and `BRIDGE`. The provisioning script
   prints a plan and exits without changes by default.
7. After reviewing the exact `pct create` command, set `APPLY=YES` and type
   `sentinel01` at the interactive confirmation. The LXC is created stopped.
8. Review `pct config CTID`, then start it manually and follow
   `docs/sentinel-dedicated-lxc.md`.

## Hold points

Do not guess the CTID, storage, template, bridge, VLAN tag, gateway, or IP. Do
not expose port 4100 to the LAN, enable workload actions, mount a Docker socket,
or use a write-capable Proxmox token during the initial read-only pilot.
