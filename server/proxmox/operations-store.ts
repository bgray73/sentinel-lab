import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ProxmoxOperationsData } from './operations-types.js';

export class ProxmoxOperationsStore {
  constructor(private readonly file:string) {}
  async load():Promise<ProxmoxOperationsData> {
    try { const value=JSON.parse(await readFile(this.file,'utf8')) as Partial<ProxmoxOperationsData>;return{snapshots:Array.isArray(value.snapshots)?value.snapshots:[]}; }
    catch(error) { if((error as NodeJS.ErrnoException).code==='ENOENT')return{snapshots:[]};throw error; }
  }
  async save(value:ProxmoxOperationsData) { await mkdir(dirname(this.file),{recursive:true});const temporary=`${this.file}.${process.pid}.${crypto.randomUUID()}.tmp`;await writeFile(temporary,JSON.stringify(value,null,2),{mode:0o600});await rename(temporary,this.file); }
}
