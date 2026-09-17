import { describe, expect, it } from 'vitest';
import { discoverNetworkInterfaces } from './network.js';
import type { NetworkInterface } from '../network/types.js';

const port = { key: 'core/1', deviceId: 'core', deviceName: 'Core', ifIndex: '1', name: 'Eth1', alias: 'pve-01 uplink', adminState: 'up', operState: 'up', health: 'healthy', speedMbps: 40000, managementAddress: '10.0.0.2', utilizationPercent: 10, errorsPerSecond: 0, discardsPerSecond: 0, flapsInWindow: 0 } as NetworkInterface;

describe('network CMDB association', () => {
  it('matches a unique name with token boundaries and leaves ambiguous aliases unlinked', () => {
    const endpoints = [{ externalId: 'node/pve-01', source: 'proxmox' as const, name: 'pve-01' }, { externalId: 'node/pve-02', source: 'proxmox' as const, name: 'pve-02' }];
    expect(discoverNetworkInterfaces([port], endpoints).relationships.filter(item => item.type === 'connected_to')).toEqual([expect.objectContaining({ toExternalId: 'node/pve-01' })]);
    expect(discoverNetworkInterfaces([{ ...port, alias: 'pve-01 and pve-02 uplink' }], endpoints).relationships.filter(item => item.type === 'connected_to')).toEqual([]);
    expect(discoverNetworkInterfaces([{ ...port, alias: 'pve-010 uplink' }], endpoints).relationships.filter(item => item.type === 'connected_to')).toEqual([]);
    expect(discoverNetworkInterfaces([{ ...port, alias: '' }], endpoints).relationships.filter(item => item.type === 'connected_to')).toEqual([]);
  });
});
