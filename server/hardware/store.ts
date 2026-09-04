import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { HardwareOperationsData } from './types.js';

const empty=():HardwareOperationsData=>({findings:[],maintenanceWindows:[],firmwareBaselines:[]});
export class HardwareOperationsStore{
  constructor(private readonly filePath:string){}
  async load(){try{const value=JSON.parse(await readFile(this.filePath,'utf8'))as Partial<HardwareOperationsData>;return{findings:Array.isArray(value.findings)?value.findings:[],maintenanceWindows:Array.isArray(value.maintenanceWindows)?value.maintenanceWindows:[],firmwareBaselines:Array.isArray(value.firmwareBaselines)?value.firmwareBaselines:[]}}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return empty();throw error}}
  async save(data:HardwareOperationsData){await mkdir(path.dirname(this.filePath),{recursive:true});const temporary=`${this.filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;await writeFile(temporary,JSON.stringify(data,null,2),{mode:0o600});await rename(temporary,this.filePath)}
}
