import { createHash } from 'node:crypto';
import { access, copyFile, cp, mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { Store } from '../store.js';
import type { BackupFile, BackupManifest, BackupSummary } from './types.js';

const backupIdPattern = /^backup-[a-zA-Z0-9._-]+$/;
const fileSources = (env: NodeJS.ProcessEnv) => [
  ['monitoring.json', env.SENTINEL_DATA_FILE || resolve('.sentinel/monitoring.json')],
  ['telemetry.json', env.SENTINEL_TELEMETRY_FILE || resolve('.sentinel/telemetry.json')],
  ['cmdb.json', env.SENTINEL_CMDB_FILE || resolve('.sentinel/cmdb.json')],
  ['hardware-operations.json', env.SENTINEL_HARDWARE_OPERATIONS_FILE || resolve('.sentinel/hardware-operations.json')],
  ['security-audit.json', env.SENTINEL_AUTH_AUDIT_FILE || resolve('.sentinel/security-audit.json')]
  ,['collectors.json', env.SENTINEL_COLLECTOR_FILE || resolve('.sentinel/collectors.json')]
  ,['servicenow-cmdb.json', env.SENTINEL_SERVICENOW_CMDB_FILE || resolve('.sentinel/servicenow-cmdb.json')]
  ,['proxmox-operations.json', env.SENTINEL_PROXMOX_OPERATIONS_FILE || resolve('.sentinel/proxmox-operations.json')]
  ,['pbs-health.json', env.SENTINEL_PBS_FILE || resolve('.sentinel/pbs-health.json')]
] as const;

export class BackupService {
  readonly root: string;
  readonly replicaRoot?: string;
  readonly enabled: boolean;
  readonly intervalHours: number;
  readonly maxBackups: number;
  readonly ready: Promise<void>;
  private queue: Promise<BackupSummary> = Promise.resolve({ id: '', createdAt: '', reason: 'manual', files: 0, bytes: 0, verified: false, replicated: null });
  private timer?: NodeJS.Timeout;
  private lastError = '';

  constructor(private readonly database: Store, private readonly env: NodeJS.ProcessEnv = process.env, schedule = true) {
    this.root = env.SENTINEL_BACKUP_DIR || resolve('.sentinel/backups');
    this.replicaRoot = env.SENTINEL_BACKUP_REPLICA_DIR ? resolve(env.SENTINEL_BACKUP_REPLICA_DIR) : undefined;
    if (this.replicaRoot === resolve(this.root)) throw new Error('Backup replica directory must differ from the primary backup directory');
    this.enabled = env.SENTINEL_BACKUPS_ENABLED === 'true';
    this.intervalHours = integer(env.SENTINEL_BACKUP_INTERVAL_HOURS, 24, 1, 168);
    this.maxBackups = integer(env.SENTINEL_BACKUP_MAX_COUNT, 14, 1, 100);
    this.ready = Promise.all([mkdir(this.root, { recursive: true }), ...(this.replicaRoot ? [mkdir(this.replicaRoot, { recursive: true })] : [])]).then(() => undefined);
    if (schedule && this.enabled) {
      this.timer = setInterval(() => { void this.create('scheduled').catch(error => { this.lastError = error instanceof Error ? error.message : 'Scheduled backup failed'; }); }, this.intervalHours * 3_600_000);
      this.timer.unref();
    }
  }

  create(reason: BackupManifest['reason'] = 'manual') {
    const run = () => this.createInternal(reason);
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  async list() {
    await this.ready;
    const entries = await readdir(this.root, { withFileTypes: true });
    const backups = (await Promise.all(entries.filter(entry => entry.isDirectory() && backupIdPattern.test(entry.name)).map(entry => this.describe(entry.name)))).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { enabled: this.enabled, intervalHours: this.intervalHours, maxBackups: this.maxBackups, replicaConfigured: Boolean(this.replicaRoot), replicaDirectory: this.replicaRoot || null, lastError: this.lastError, backups, summary: { count: backups.length, verified: backups.filter(item => item.verified).length, replicated: backups.filter(item => item.replicated).length, latestAt: backups[0]?.createdAt || null } };
  }

  async verify(id: string) {
    assertBackupId(id);
    return verifyBackupDirectory(this.root, id);
  }

  async replicate(id: string) {
    assertBackupId(id);
    if (!this.replicaRoot) throw new Error('Backup replication is not configured');
    const primary = await verifyBackupDirectory(this.root, id);
    if (!primary.verified) throw new Error(primary.error || 'Primary backup verification failed');
    await this.replicateInternal(id);
    return this.describe(id);
  }

  async prometheus() {
    const value = await this.list();
    const latest = value.summary.latestAt ? Math.max(0, (Date.now() - new Date(value.summary.latestAt).getTime()) / 1000) : -1;
    return `# HELP sentinel_backups_total Retained Sentinel backups\n# TYPE sentinel_backups_total gauge\nsentinel_backups_total ${value.summary.count}\n# HELP sentinel_backups_verified Verified retained Sentinel backups\n# TYPE sentinel_backups_verified gauge\nsentinel_backups_verified ${value.summary.verified}\n# HELP sentinel_backups_replicated Backups verified on the replica target\n# TYPE sentinel_backups_replicated gauge\nsentinel_backups_replicated ${value.summary.replicated}\n# HELP sentinel_backup_latest_age_seconds Age of latest backup or -1 when none exists\n# TYPE sentinel_backup_latest_age_seconds gauge\nsentinel_backup_latest_age_seconds ${latest}\n`;
  }

  close() { if (this.timer) clearInterval(this.timer); }

  private async createInternal(reason: BackupManifest['reason']) {
    await this.ready;
    const createdAt = new Date().toISOString();
    const id = `backup-${createdAt.replace(/[:]/g, '-').replace(/\.\d{3}Z$/, 'Z')}-${crypto.randomUUID().slice(0, 8)}`;
    const temporary = resolve(this.root, `.${id}.tmp`); const destination = resolve(this.root, id);
    await mkdir(temporary, { recursive: false });
    try {
      const databaseTarget = resolve(temporary, 'sentinel.db');
      this.database.backup(databaseTarget);
      const copied = ['sentinel.db'];
      for (const [name, source] of fileSources(this.env)) {
        if (await exists(source)) { await copyFile(source, resolve(temporary, name)); copied.push(name); }
      }
      const files = await Promise.all(copied.map(name => describeFile(resolve(temporary, name), name)));
      const manifest: BackupManifest = { schemaVersion: 1, id, createdAt, reason, files };
      await writeFile(resolve(temporary, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
      await rename(temporary, destination);
      const result = await verifyBackupDirectory(this.root, id);
      if (!result.verified) throw new Error(result.error || 'Backup verification failed');
      let replicated: boolean | null = null; let replicaError: string | undefined;
      if (this.replicaRoot) {
        try { await this.replicateInternal(id); replicated = true; }
        catch (error) { replicated = false; replicaError = error instanceof Error ? error.message : 'Backup replication failed'; }
      }
      await this.prune(); this.lastError = replicaError || '';
      return { id, createdAt, reason, files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), verified: true, replicated, replicaError } satisfies BackupSummary;
    } catch (error) {
      await Promise.all([
        rm(temporary, { recursive: true, force: true }),
        rm(destination, { recursive: true, force: true })
      ]);
      throw error;
    }
  }

  private async describe(id: string): Promise<BackupSummary> {
    try {
      const verified = await verifyBackupDirectory(this.root, id); const manifest = await readManifest(this.root, id);
      const replica = this.replicaRoot ? await verifyBackupDirectory(this.replicaRoot, id) : null;
      return { id, createdAt: manifest.createdAt, reason: manifest.reason, files: manifest.files.length, bytes: manifest.files.reduce((sum, file) => sum + file.bytes, 0), verified: verified.verified, error: verified.error, replicated: replica?.verified ?? null, replicaError: replica && !replica.verified ? replica.error : undefined };
    } catch (error) { return { id, createdAt: '', reason: 'manual', files: 0, bytes: 0, verified: false, replicated: null, error: error instanceof Error ? error.message : 'Unreadable backup' }; }
  }

  private async prune() {
    const value = await this.list();
    for (const backup of value.backups.slice(this.maxBackups)) {
      assertBackupId(backup.id);
      await rm(resolve(this.root, backup.id), { recursive: true, force: true });
      if (this.replicaRoot) await rm(resolve(this.replicaRoot, backup.id), { recursive: true, force: true });
    }
  }

  private async replicateInternal(id: string) {
    if (!this.replicaRoot) return;
    const stagingRoot = resolve(this.replicaRoot, '.staging'); const temporary = resolve(stagingRoot, id); const destination = resolve(this.replicaRoot, id); const previous = resolve(this.replicaRoot, `.${id}.previous`);
    await mkdir(stagingRoot, { recursive: true }); await rm(temporary, { recursive: true, force: true }); await rm(previous, { recursive: true, force: true });
    try {
      await cp(resolve(this.root, id), temporary, { recursive: true, force: false });
      const result = await verifyBackupDirectory(stagingRoot, id);
      if (!result.verified) throw new Error(result.error || 'Replica verification failed');
      if (await exists(destination)) await rename(destination, previous);
      try { await rename(temporary, destination); }
      catch (error) { if (await exists(previous)) await rename(previous, destination); throw error; }
      await rm(previous, { recursive: true, force: true });
    } catch (error) { await rm(temporary, { recursive: true, force: true }); throw error; }
  }
}

export async function verifyBackupDirectory(root: string, id: string) {
  try {
    const manifest = await readManifest(root, id);
    for (const expected of manifest.files) {
      const actual = await describeFile(resolve(root, id, expected.name), expected.name);
      if (actual.bytes !== expected.bytes || actual.sha256 !== expected.sha256) return { id, verified: false, error: `Checksum mismatch for ${expected.name}` };
    }
    return { id, verified: true as const };
  } catch (error) { return { id, verified: false as const, error: error instanceof Error ? error.message : 'Backup verification failed' }; }
}

export async function readManifest(root: string, id: string) {
  assertBackupId(id);
  const manifest = JSON.parse(await readFile(resolve(root, id, 'manifest.json'), 'utf8')) as BackupManifest;
  if (manifest.schemaVersion !== 1 || manifest.id !== id || !Array.isArray(manifest.files)) throw new Error('Invalid backup manifest');
  for (const file of manifest.files) if (!/^[a-z0-9.-]+$/.test(file.name)) throw new Error('Invalid backup filename');
  return manifest;
}

export function backupDestinations(env: NodeJS.ProcessEnv) {
  return new Map<string, string>([['sentinel.db', env.DATABASE_PATH || resolve('data/sentinel.db')], ...fileSources(env)]);
}

function assertBackupId(id: string) { if (!backupIdPattern.test(id)) throw new Error('Invalid backup identifier'); }
async function exists(file: string) { try { await access(file); return true; } catch { return false; } }
async function describeFile(file: string, name: string): Promise<BackupFile> { const content = await readFile(file); const info = await stat(file); return { name, bytes: info.size, sha256: createHash('sha256').update(content).digest('hex') }; }
function integer(value: string | undefined, fallback: number, minimum: number, maximum: number) { const parsed = value === undefined ? fallback : Number(value); if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) throw new Error(`Backup setting must be an integer from ${minimum} to ${maximum}`); return parsed; }
