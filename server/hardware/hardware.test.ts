import { afterEach, describe, expect, it, vi } from 'vitest';
import { HardwareService } from './service.js';
import { normalizeSnmp, parsePrometheus, snmpConfigFromEnvironment } from './snmp.js';
import { discoverRedfish, redfishTargetsFromEnvironment } from './redfish.js';

afterEach(() => vi.unstubAllGlobals());

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
    const service = new HardwareService({}); await service.ready;
    expect(service.status().mode).toBe('simulation');
    expect(service.inventory().summary.devices).toBeGreaterThanOrEqual(5);
    expect(service.inventory().devices.some(device => device.category === 'ups')).toBe(true);
  });
});
