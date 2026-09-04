import type { AddressInfo } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../app.js';
import { Store } from '../store.js';
import { simulatedDockerInventory } from '../docker/inventory.js';
import { CollectorService } from './service.js';

describe('collector API',()=>{let directory='';let store:Store|undefined;let server:ReturnType<ReturnType<typeof createApp>['listen']>|undefined;afterEach(async()=>{server?.close();store?.close();if(directory)await rm(directory,{recursive:true,force:true});});
  it('accepts bearer-authenticated snapshots while keeping management separate',async()=>{directory=await mkdtemp(join(tmpdir(),'sentinel-collector-api-'));const collectors=new CollectorService({SENTINEL_COLLECTOR_FILE:join(directory,'collectors.json')});const registration=await collectors.register({name:'Docker edge',site:'Remote',kind:'docker'});store=new Store(':memory:');server=createApp(store,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,undefined,collectors).listen(0,'127.0.0.1');await new Promise<void>((resolve,reject)=>{server?.once('listening',resolve);server?.once('error',reject)});const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;const body=JSON.stringify({sequence:1,generatedAt:new Date().toISOString(),version:'0.1.0',docker:simulatedDockerInventory()});expect((await fetch(`${base}/api/collector/v1/snapshots`,{method:'POST',headers:{authorization:'Bearer wrong','content-type':'application/json'},body})).status).toBe(401);expect((await fetch(`${base}/api/collector/v1/snapshots`,{method:'POST',headers:{authorization:`Bearer ${registration.token}`,'content-type':'application/json'},body})).status).toBe(202);const dashboard=await fetch(`${base}/api/collectors`);expect(dashboard.status).toBe(200);expect((await dashboard.json()).summary.online).toBe(1);});
});
