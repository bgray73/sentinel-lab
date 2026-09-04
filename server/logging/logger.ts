import type { NextFunction,Request,Response } from 'express';

type Context=Record<string,unknown>;type Sink=(line:string)=>void;
const secretPattern=/authorization|cookie|password|secret|token|api[-_]?key/i;
function safe(value:unknown,depth=0):unknown{if(depth>3)return'[truncated]';if(Array.isArray(value))return value.slice(0,20).map(item=>safe(item,depth+1));if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value as Context).slice(0,50).map(([key,item])=>[key,secretPattern.test(key)?'[redacted]':safe(item,depth+1)]));if(typeof value==='string')return value.slice(0,2000);return value}

export class StructuredLogger{
  constructor(private readonly sink:Sink=line=>console.log(line)){}
  log(level:'debug'|'info'|'warn'|'error',message:string,context:Context={}){this.sink(JSON.stringify({timestamp:new Date().toISOString(),level,message,service:'sentinel-api',...safe(context) as Context}))}
  debug(message:string,context?:Context){this.log('debug',message,context)}info(message:string,context?:Context){this.log('info',message,context)}warn(message:string,context?:Context){this.log('warn',message,context)}error(message:string,context?:Context){this.log('error',message,context)}
}

export const logger=new StructuredLogger();
export function requestLogger(log:StructuredLogger){return(req:Request,res:Response,next:NextFunction)=>{const started=Date.now();const requestId=String(req.headers['x-request-id']||crypto.randomUUID()).slice(0,100);res.setHeader('x-request-id',requestId);res.on('finish',()=>log.info('http_request',{requestId,method:req.method,path:req.path,statusCode:res.statusCode,durationMs:Date.now()-started,ci_id:'service/sentinel-api'}));next()}}
