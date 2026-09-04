import type { DockerInventory } from '../docker/types.js';
import type { ProxmoxInventory } from '../proxmox/types.js';

export type CollectorKind = 'proxmox' | 'docker' | 'hybrid';
export type CollectorStatus = 'online' | 'stale' | 'never';
export type CollectorPayload = { sequence:number;generatedAt:string;version:string;proxmox?:ProxmoxInventory;docker?:DockerInventory;errors?:string[] };
export type StoredCollector = { id:string;name:string;site:string;kind:CollectorKind;intervalSeconds:number;tokenHash:string;createdAt:string;lastSeenAt?:string;lastSequence?:number;lastSnapshot?:CollectorPayload };
export type CollectorData = { collectors:StoredCollector[] };
export type CollectorView = Omit<StoredCollector,'tokenHash'|'lastSnapshot'>&{status:CollectorStatus;ageSeconds:number|null;version:string|null;summary:{proxmoxResources:number;dockerContainers:number;warnings:number;errors:number}};
export type SiteView = {name:string;collectors:number;online:number;stale:number;nodes:number;virtualMachines:number;lxcContainers:number;dockerContainers:number;warnings:number};
export type CollectorDashboard = {collectors:CollectorView[];sites:SiteView[];summary:{collectors:number;sites:number;online:number;stale:number;never:number;resources:number;warnings:number}};
