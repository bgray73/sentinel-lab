import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HardwareService } from './service.js';
import { evaluateHardware, hardwareThresholdsFromEnvironment, reconcileFindings } from './operations.js';
import { simulatedHardwareInventory } from './inventory.js';
import { normalizeSnmp, parsePrometheus, snmpConfigFromEnvironment } from './snmp.js';
import { discoverRedfish, redfishTargetsFromEnvironment } from './redfish.js';

const directories:string[]=[];
afterEach(async () => { vi.unstubAllGlobals(); await Promise.all(directories.splice(0).map(directory=>rm(directory,{recursive:true,force:true}))); });

describe('hardware discovery', () => {
  it('requires secure Redfish endpoints by default', () => {
    const targets = JSON.stringify([{ id:'pve-01', name:'PVE 01', url:'http://idrac.lab', username:'sentinel', password:'secret' }]);
    expect(() => redfishTargetsFromEnvironment({ SENTINEL_REDFISH_TARGETS:targets })).toThrow('require HTTPS');
    expect(redfishTargetsFromEnvironment({ SENTINEL_REDFISH_TARGETS:targets, REDFISH_ALLOW_HTTP:'true' })).toHaveLength(1);
  });

  it('requires an exporter when SNMP targets are configured', () => {
    const targets = JSON.stringify([{ id:'core', name:'Core', target:'10.0.0.2', category:'switch' }]);
    expect(() => snmpConfigFromEnvironment({ SENTINEL_SNMP_TARGETS:targets })).toThrow('SNMP_EXPORTER_URL');
  });

  it('rejects inconsistent operational thresholds',()=>{
    expect(()=>hardwareThresholdsFromEnvironment({HARDWARE_TEMPERATURE_WARNING_C:'90',HARDWARE_TEMPERATURE_CRITICAL_C:'80'})).toThrow('inconsistent');
  });

  it('normalizes interface and UPS metrics from Prometheus text', () => {
    const metrics = parsePrometheus('ifOperStatus{ifIndex="1",ifName="Ethernet1/1"} 1\nifOperStatus{ifIndex="2",ifName="Ethernet1/2"} 2\nupsBatteryStatus 3\nupsEstimatedMinutesRemaining 18\nupsOutputPercentLoad 61\n');
    const device = normalizeSnmp({ id:'ups', name:'Rack UPS', target:'10.0.0.20', category:'ups', module:'ups_mib', auth:'sentinel_v3' }, metrics);
    expect(device.health).toBe('warning');
    expect(device.metrics.interfacesUp).toBe(1);
    expect(device.metrics.batteryMinutesRemaining).toBe(18);
  });

  it('collects a minimal Redfish system even when optional endpoints are absent', async () => {
    const replies:Record<string,unknown> = {
      '/redfish/v1/': { Systems:{'@odata.id':'/redfish/v1/Systems'}, Chassis:{'@odata.id':'/redfish/v1/Chassis'} },
      '/redfish/v1/Systems': { Members:[{'@odata.id':'/redfish/v1/Systems/1'}] },
      '/redfish/v1/Systems/1': { Manufacturer:'Dell Inc.', Model:'PowerEdge R640', SerialNumber:'ABC', PowerState:'On', HostName:'pve-01', Status:{Health:'OK'} },
      '/redfish/v1/Chassis': { Members:[] },
    };
    vi.stubGlobal('fetch', vi.fn(async (input:URL|string) => { const path = new URL(String(input)).pathname; return new Response(JSON.stringify(replies[path]), { status:replies[path]?200:404, headers:{'Content-Type':'application/json'} }); }));
    const device = await discoverRedfish({ id:'pve-01', name:'pve-01', url:'https://idrac.lab', username:'sentinel', password:'secret' });
    expect(device.health).toBe('healthy');
    expect(device.model).toBe('PowerEdge R640');
    expect(device.attributes.hostName).toBe('pve-01');
  });

  it('starts safely with representative simulated hardware', async () => {
    const directory=await mkdtemp(path.join(os.tmpdir(),'sentinel-hardware-'));directories.push(directory);
    const operationsFile=path.join(directory,'operations.json');const service = new HardwareService({SENTINEL_HARDWARE_OPERATIONS_FILE:operationsFile}); await service.ready;
    expect(service.status().mode).toBe('simulation');
    expect(service.inventory().summary.devices).toBeGreaterThanOrEqual(5);
    expect(service.inventory().devices.some(device => device.category === 'ups')).toBe(true);
    expect(service.operations().summary.active).toBeGreaterThan(0);
    await service.recordBaseline('dell-r640-01');
    const start=new Date();const end=new Date(start.getTime()+3_600_000);await service.addMaintenance({deviceId:'dell-r440-02',reason:'Firmware update',startsAt:start.toISOString(),endsAt:end.toISOString()});
    const restored=new HardwareService({SENTINEL_HARDWARE_OPERATIONS_FILE:operationsFile});await restored.ready;
    expect(restored.operations().summary).toMatchObject({baselines:1,maintenance:1});
  });

  it('detects threshold violations, firmware drift, and maintenance suppression', () => {
    const inventory=simulatedHardwareInventory();const ups=inventory.devices.find(device=>device.category==='ups')!;ups.metrics.batteryMinutesRemaining=8;ups.metrics.loadPercent=95;
    const server=inventory.devices.find(device=>device.id==='dell-r640-01')!;
    const candidates=evaluateHardware(inventory,[{deviceId:server.id,firmwareVersion:'6.0.0',model:server.model||'',serialNumber:server.serialNumber||'',recordedAt:new Date().toISOString()}]);
    expect(candidates.map(item=>item.kind)).toEqual(expect.arrayContaining(['ups_runtime','ups_load','firmware_drift']));
    const now=new Date('2026-09-04T12:00:00Z');const findings=reconcileFindings(candidates,[],[{id:'mw',deviceId:ups.id,reason:'Battery test',startsAt:'2026-09-04T11:00:00Z',endsAt:'2026-09-04T13:00:00Z',createdAt:'2026-09-04T10:00:00Z'}],now);
    expect(findings.filter(item=>item.deviceId===ups.id).every(item=>item.suppressed)).toBe(true);
    expect(findings.find(item=>item.kind==='firmware_drift')?.suppressed).toBe(false);
  });

  it('resolves a finding when the condition clears', () => {
    const inventory=simulatedHardwareInventory();const candidates=evaluateHardware(inventory);const active=reconcileFindings(candidates,[],[],new Date('2026-09-04T12:00:00Z'));
    const resolved=reconcileFindings([],active,[],new Date('2026-09-04T12:05:00Z'));
    expect(resolved.every(item=>item.status==='resolved'&&item.resolvedAt)).toBe(true);
  });
});
