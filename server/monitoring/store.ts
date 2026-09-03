import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { MonitoringData } from './types.js';

export class MonitoringStore {
  constructor(private readonly filePath: string) {}
  async load(): Promise<MonitoringData> {
    try {
      const data = JSON.parse(await readFile(this.filePath, 'utf8')) as Partial<MonitoringData>;
      return { monitors: data.monitors || [], results: data.results || [], alertRules: data.alertRules || [], incidents: data.incidents || [], deliveries: data.deliveries || [], dependencyMappings: data.dependencyMappings || [], retentionPolicy:data.retentionPolicy||{days:30,maxResults:25_000} };
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { monitors: [], results: [], alertRules: [], incidents: [], deliveries: [], dependencyMappings: [], retentionPolicy:{days:30,maxResults:25_000} }; throw error; }
  }
  async save(data: MonitoringData) {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(temporary, this.filePath);
  }
}
