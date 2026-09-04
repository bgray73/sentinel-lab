export interface BackupFile { name: string; bytes: number; sha256: string }
export interface BackupManifest { schemaVersion: 1; id: string; createdAt: string; reason: 'manual' | 'scheduled'; files: BackupFile[] }
export interface BackupSummary { id: string; createdAt: string; reason: BackupManifest['reason']; files: number; bytes: number; verified: boolean; error?: string }
