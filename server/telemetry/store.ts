import {mkdir,readFile,rename,writeFile} from 'node:fs/promises';
import path from 'node:path';
import type {TelemetryData} from './types.js';

export class TelemetryStore { constructor(private readonly filePath:string){} async load():Promise<TelemetryData>{try{return JSON.parse(await readFile(this.filePath,'utf8')) as TelemetryData}catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return{samples:[]};throw error}} async save(data:TelemetryData){await mkdir(path.dirname(this.filePath),{recursive:true});const temporary=`${this.filePath}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;await writeFile(temporary,JSON.stringify(data,null,2),{mode:0o600});await rename(temporary,this.filePath)} }
