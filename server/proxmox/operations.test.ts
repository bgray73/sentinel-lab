import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildOperations, ProxmoxOperationsService } from './operations.js';

const directories:string[]=[];
afterEach(async()=>Promise.all(directories.splice(0).map(value=>rm(value,{recursive:true,force:true}))));
const settings={intervalSeconds:300,retentionDays:30,backupWarningHours:26,backupCriticalHours:48,storageWarningPercent:80,storageCriticalPercent:90};

describe('Proxmox operations health',()=>{
  it('detects quorum loss, storage pressure, failed tasks, and stale backups',()=>{const now=Math.floor(Date.now()/1000);const snapshot=buildOperations([{type:'cluster',name:'lab',quorate:0},{type:'node',name:'pve-01',online:1},{type:'node',name:'pve-02',online:0}],[{id:'storage/zfs',type:'storage',name:'zfs',node:'pve-01',status:'available',disk:95,maxdisk:100}],[{upid:'failed',node:'pve-01',type:'vzdump',status:'permission denied',starttime:now-3600,endtime:now-3500},{upid:'old',node:'pve-01',type:'vzdump',status:'OK',starttime:now-60*3600,endtime:now-59*3600}],[],[],settings,'live');expect(snapshot.health).toBe('critical');expect(snapshot.quorum.quorate).toBe(false);expect(snapshot.summary).toMatchObject({critical:4,storagePressure:1,failedTasks24h:1});expect(snapshot.backup.health).toBe('critical')});
  it('keeps optional endpoint failures visible without discarding required health',async()=>{const directory=await mkdtemp(join(tmpdir(),'sentinel-pve-ops-'));directories.push(directory);const fetcher=vi.fn(async(input:string|URL|Request)=>{const url=String(input);if(url.includes('/cluster/status'))return Response.json({data:[{type:'cluster',name:'lab',quorate:1},{type:'node',name:'pve-01',online:1}]});if(url.includes('/cluster/resources'))return Response.json({data:[{id:'storage/zfs',type:'storage',name:'zfs',node:'pve-01',status:'available',disk:10,maxdisk:100}]});return new Response('forbidden',{status:403})});const service=new ProxmoxOperationsService({baseUrl:'https://pve.local:8006',tokenId:'sentinel@pve!monitor',tokenSecret:'secret'},{SENTINEL_PROXMOX_OPERATIONS_FILE:join(directory,'operations.json')},fetcher);await service.ready;const current=service.snapshot().current!;expect(current.clusterName).toBe('lab');expect(current.collectionErrors).toHaveLength(3);expect(current.collectionErrors[0]).toContain('HTTP 403')});
  it('provides a safe simulation and Prometheus export without credentials',async()=>{const directory=await mkdtemp(join(tmpdir(),'sentinel-pve-ops-'));directories.push(directory);const service=new ProxmoxOperationsService(null,{SENTINEL_PROXMOX_OPERATIONS_FILE:join(directory,'operations.json')});await service.ready;expect(service.snapshot().current).toMatchObject({mode:'simulation',clusterName:'Sentinel homelab'});expect(await service.prometheus()).toContain('sentinel_proxmox_backup_age_hours')});
});
