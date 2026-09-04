export type LogLevel='debug'|'info'|'warn'|'error'|'critical'|'unknown';
export type LogEntry={id:string;timestamp:string;level:LogLevel;message:string;source:string;service:string;ciId:string;host:string;labels:Record<string,string>;raw:string};
export type LogRange='15m'|'1h'|'6h'|'24h'|'7d';
export type LogSearchFilters={range?:string;limit?:number;level?:string;source?:string;service?:string;ciIds?:string[];search?:string};
export type LogSearchResult={mode:'simulation'|'live';query:string;range:LogRange;start:string;end:string;entries:LogEntry[];summary:{total:number;errors:number;warnings:number;sources:number;services:number}};
