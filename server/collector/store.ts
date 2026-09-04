import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { CollectorData } from './types.js';

export class CollectorStore {
  constructor(private readonly filePath:string) {}
  async load():Promise<CollectorData> { try { return JSON.parse(await readFile(this.filePath,'utf8')) as CollectorData; } catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT') return {collectors:[]}; throw error; } }
  async save(data:CollectorData) { await mkdir(dirname(this.filePath),{recursive:true});const temporary=`${this.filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;await writeFile(temporary,JSON.stringify(data,null,2),{mode:0o600});await rename(temporary,this.filePath); }
}
