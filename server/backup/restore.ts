import { copyFile, mkdir, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { backupDestinations, readManifest, verifyBackupDirectory } from './service.js';

export async function restoreBackup(env: NodeJS.ProcessEnv, id: string, confirmation: string) {
  if (confirmation !== id) throw new Error('Restore confirmation must exactly match the backup identifier');
  const root = env.SENTINEL_BACKUP_DIR || resolve('.sentinel/backups');
  const verification = await verifyBackupDirectory(root, id);
  if (!verification.verified) throw new Error(verification.error || 'Backup verification failed');
  const manifest = await readManifest(root, id); const destinations = backupDestinations(env);
  const restorePoint = resolve(env.SENTINEL_RESTORE_POINT_DIR || resolve(root, '..', 'restore-points'), `restore-point-${new Date().toISOString().replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z')}`);
  await mkdir(restorePoint, { recursive: true });

  // Capture every live file first so a complete rollback point exists before
  // the restore changes any state.
  for (const file of manifest.files) {
    const destination = destinations.get(file.name); if (!destination) throw new Error(`Unsupported backup file ${file.name}`);
    await mkdir(dirname(destination), { recursive: true });
    try { await copyFile(destination, resolve(restorePoint, file.name)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  }

  for (const file of manifest.files) {
    const destination = destinations.get(file.name)!;
    const temporary = `${destination}.${process.pid}.restore.tmp`;
    await copyFile(resolve(root, id, file.name), temporary);
    await rename(temporary, destination);
  }
  return { restored: true, backupId: id, restorePoint };
}

function argument(name: string) { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] || '' : ''; }

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  restoreBackup(process.env, argument('--backup'), argument('--confirm')).then(result => console.log(JSON.stringify(result))).catch(error => { console.error(error instanceof Error ? error.message : 'Restore failed'); process.exitCode = 1; });
}
