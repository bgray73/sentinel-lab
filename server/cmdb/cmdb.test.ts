import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MonitoringService } from '../monitoring/service.js';
import { HardwareService } from '../hardware/service.js';
import { CmdbService } from './service.js';
import { NetworkService } from '../network/service.js';
import { buildTopology } from '../topology/engine.js';
import { simulatedInventory } from '../proxmox/inventory.js';
import { simulatedDockerInventory } from '../docker/inventory.js';

const directories: string[] = [];
afterEach(async () => Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true }))));

async function services() {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'sentinel-cmdb-'));
  directories.push(directory);
  const monitoring = new MonitoringService({ SENTINEL_DATA_FILE: path.join(directory, 'monitoring.json') });
  const hardware = new HardwareService({ SENTINEL_HARDWARE_OPERATIONS_FILE: path.join(directory, 'hardware-operations.json') });
  const cmdb = new CmdbService({ SENTINEL_CMDB_FILE: path.join(directory, 'cmdb.json') }, monitoring, hardware);
  await Promise.all([monitoring.ready, hardware.ready, cmdb.ready]);
  return cmdb;
}

describe('configuration management database', () => {
  it('discovers configuration items and their relationships without duplicates', async () => {
    const cmdb = await services();
    expect(cmdb.list().some(item => item.class === 'node' && item.source === 'proxmox')).toBe(true);
    expect(cmdb.list().some(item => item.class === 'container' && item.source === 'docker')).toBe(true);
    expect(cmdb.list().some(item => item.class === 'service' && item.source === 'monitoring')).toBe(true);
    expect(cmdb.list().some(item => item.class === 'physical_server' && item.source === 'hardware')).toBe(true);
    expect(cmdb.list().some(item => item.class === 'ups' && item.source === 'hardware')).toBe(true);
    expect(cmdb.relationships().some(relation => relation.type === 'hosts')).toBe(true);
    const count = cmdb.list().length;
    await cmdb.reconcile();
    expect(cmdb.list()).toHaveLength(count);
    expect(cmdb.status()).toMatchObject({ mode: 'simulation', stale: 0 });
  });

  it('supports manual items, metadata edits, relationships, and change history', async () => {
    const cmdb = await services();
    const database = await cmdb.createItem({ name: 'Lab PostgreSQL', class: 'database', externalId: 'manual/lab-postgres', owner: 'Platform', criticality: 'high', tags: ['data', 'production'] });
    const updated = await cmdb.updateItem(database.id, { lifecycle: 'retired', owner: 'Operations', attributes: { version: '16' } });
    expect(updated).toMatchObject({ lifecycle: 'retired', owner: 'Operations', version: 2 });
    const application = cmdb.list().find(item => item.class === 'application');
    expect(application).toBeDefined();
    const relationship = await cmdb.addRelationship({ fromId: application!.id, toId: database.id, type: 'depends_on' });
    expect(relationship.source).toBe('manual');
    expect(cmdb.changes(20, database.id).map(change => change.action)).toEqual(expect.arrayContaining(['manual_created', 'lifecycle_changed']));
    await expect(cmdb.createItem({ name: 'Duplicate', class: 'database', externalId: 'manual/lab-postgres' })).rejects.toThrow('already exists');
  });

  it('validates discovery settings and manual relationships', async () => {
    expect(() => new CmdbService({ SENTINEL_CMDB_DISCOVERY_INTERVAL_SECONDS: '10' })).toThrow('between 60 and 86400');
    const cmdb = await services();
    const item = cmdb.list()[0];
    await expect(cmdb.addRelationship({ fromId: item.id, toId: item.id, type: 'depends_on' })).rejects.toThrow('cannot relate to itself');
  });

  it('tracks interface CIs and conservatively links uniquely named node uplinks', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'sentinel-cmdb-network-'));
    directories.push(directory);
    const network = new NetworkService({ SENTINEL_NETWORK_FILE: path.join(directory, 'network.json') });
    const hardware = new HardwareService({ SENTINEL_HARDWARE_OPERATIONS_FILE: path.join(directory, 'hardware.json') });
    const cmdb = new CmdbService({ SENTINEL_CMDB_FILE: path.join(directory, 'cmdb.json') }, undefined, hardware, undefined, network);
    await Promise.all([network.ready, hardware.ready, cmdb.ready]);
    const port = cmdb.list().find(item => item.source === 'network' && item.externalId === 'interface/nexus-core-01/1');
    const node = cmdb.list().find(item => item.externalId === 'node/pve-01');
    const switchCi = cmdb.list().find(item => item.externalId === 'hardware/nexus-core-01');
    expect(port).toMatchObject({ class: 'network_interface', status: 'up', attributes: { alias: 'pve-01 40G uplink' } });
    expect(cmdb.relationships()).toEqual(expect.arrayContaining([
      expect.objectContaining({ fromId: switchCi?.id, toId: port?.id, type: 'contains', source: 'network' }),
      expect.objectContaining({ fromId: port?.id, toId: node?.id, type: 'connected_to', source: 'network' }),
    ]));
    expect(cmdb.list().filter(item => item.class === 'network_interface')).toHaveLength(6);
    const topology = buildTopology(simulatedInventory(), simulatedDockerInventory(), [], { incidents: [], mappings: [] }, { items: cmdb.list(), relationships: cmdb.relationships() });
    expect(topology.edges).toEqual(expect.arrayContaining([expect.objectContaining({ from: 'interface/nexus-core-01/1', to: 'node/pve-01', relation: 'connected_to', inferred: true })]));
    expect(topology.edges).toEqual(expect.arrayContaining([expect.objectContaining({ from: 'interface/nexus-core-01/4', to: 'hardware/supermicro-storage', relation: 'connected_to', inferred: true })]));
    expect(topology.nodes).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'hardware/nexus-core-01', type: 'switch' }), expect.objectContaining({ id: 'interface/nexus-core-01/1', type: 'network-interface' })]));
    const secondPort = cmdb.list().find(item => item.externalId === 'interface/nexus-core-01/2')!;
    const secondNode = cmdb.list().find(item => item.externalId === 'node/pve-02')!;
    expect((await cmdb.addRelationship({ fromId: secondPort.id, toId: secondNode.id, type: 'connected_to' })).source).toBe('manual');
    const count = cmdb.relationships().length;
    await cmdb.reconcile();
    expect(cmdb.relationships()).toHaveLength(count);
    const original = network.snapshot();
    vi.spyOn(network, 'snapshot').mockReturnValue({ ...original, current: { ...original.current!, interfaces: original.current!.interfaces.filter(item => item.key !== 'nexus-core-01/1'), collectionErrors: ['second switch timed out'] } });
    await cmdb.reconcile();
    expect(cmdb.get(port!.id)?.lifecycle).toBe('active');
    expect(cmdb.relationships().some(relation => relation.fromId === port!.id && relation.toId === node!.id)).toBe(true);
    vi.mocked(network.snapshot).mockReturnValue({ ...original, current: { ...original.current!, interfaces: original.current!.interfaces.filter(item => item.key !== 'nexus-core-01/1'), collectionErrors: [] } });
    await cmdb.reconcile();
    expect(cmdb.get(port!.id)?.lifecycle).toBe('stale');
    expect(cmdb.relationships().some(relation => relation.source === 'network' && relation.fromId === port!.id)).toBe(false);
    vi.mocked(network.snapshot).mockRestore();
  });
});
