import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MonitoringService } from '../monitoring/service.js';
import { HardwareService } from '../hardware/service.js';
import { CmdbService } from './service.js';

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
});
