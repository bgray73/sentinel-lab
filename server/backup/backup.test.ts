import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { Store } from '../store.js';
import { restoreBackup } from './restore.js';
import { BackupService } from './service.js';

describe('backup and recovery', () => {
  let directory = '';
  afterEach(async () => { if (directory) await rm(directory, { recursive: true, force: true }); directory = ''; });

  it('creates, verifies, restores, and preserves a rollback point', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sentinel-backup-'));
    const databasePath = join(directory, 'live', 'sentinel.db');
    const monitoringPath = join(directory, 'live', 'monitoring.json');
    const env = { DATABASE_PATH: databasePath, SENTINEL_DATA_FILE: monitoringPath, SENTINEL_BACKUP_DIR: join(directory, 'backups'), SENTINEL_BACKUP_REPLICA_DIR: join(directory, 'replica'), SENTINEL_RESTORE_POINT_DIR: join(directory, 'restore-points'), SENTINEL_BACKUP_MAX_COUNT: '3' };
    const store = new Store(databasePath);
    store.insertTest({ id: 'before-backup', name: 'Before backup', kind: 'api', target: 'https://example.test', critical: false, timeoutMs: 1000 });
    await writeFile(monitoringPath, '{"version":"before"}');
    const service = new BackupService(store, env, false);
    const backup = await service.create('manual');
    expect(backup.verified).toBe(true);
    expect(backup.replicated).toBe(true);
    expect(await readFile(join(env.SENTINEL_BACKUP_REPLICA_DIR, backup.id, 'manifest.json'), 'utf8')).toContain(backup.id);
    expect((await service.verify(backup.id)).verified).toBe(true);

    store.insertTest({ id: 'after-backup', name: 'After backup', kind: 'api', target: 'https://example.test', critical: false, timeoutMs: 1000 });
    await writeFile(monitoringPath, '{"version":"after"}');
    store.close();
    const restored = await restoreBackup(env, backup.id, backup.id);
    expect(await readFile(monitoringPath, 'utf8')).toBe('{"version":"before"}');
    expect(await readFile(join(restored.restorePoint, 'monitoring.json'), 'utf8')).toBe('{"version":"after"}');
    const restoredStore = new Store(databasePath);
    expect(restoredStore.listTests().some(test => test.id === 'before-backup')).toBe(true);
    expect(restoredStore.listTests().some(test => test.id === 'after-backup')).toBe(false);
    restoredStore.close();

    await writeFile(join(env.SENTINEL_BACKUP_DIR, backup.id, 'monitoring.json'), 'corrupted');
    expect(await service.verify(backup.id)).toMatchObject({ verified: false, error: expect.stringContaining('Checksum mismatch') });
    service.close();
  });

  it('requires exact restore confirmation and validates settings', async () => {
    directory = await mkdtemp(join(tmpdir(), 'sentinel-backup-'));
    await expect(restoreBackup({ SENTINEL_BACKUP_DIR: directory }, 'backup-safe', 'wrong')).rejects.toThrow(/exactly match/);
    const store = new Store(':memory:');
    expect(() => new BackupService(store, { SENTINEL_BACKUP_INTERVAL_HOURS: '0' }, false)).toThrow(/integer from 1 to 168/);
    store.close();
  });
});
