import type { MetricRange } from '../monitoring/types.js';

export type TelemetryResourceType='node'|'vm'|'lxc'|'container';
export type TelemetrySample={id:string;resourceId:string;name:string;type:TelemetryResourceType;source:'proxmox'|'docker';state:string;cpuPercent:number;memoryPercent:number|null;diskPercent:number|null;networkRxBytesTotal:number|null;networkTxBytesTotal:number|null;networkRxBytesPerSecond:number|null;networkTxBytesPerSecond:number|null;diskReadBytesTotal:number|null;diskWriteBytesTotal:number|null;diskReadBytesPerSecond:number|null;diskWriteBytesPerSecond:number|null;collectedAt:string};
export type TelemetryPoint={timestamp:string;samples:number;cpuPercent:number|null;memoryPercent:number|null;diskPercent:number|null;networkRxBytesPerSecond:number|null;networkTxBytesPerSecond:number|null;diskReadBytesPerSecond:number|null;diskWriteBytesPerSecond:number|null};
export type TelemetrySeries={resourceId:string;name:string;type:TelemetryResourceType;source:'proxmox'|'docker';state:string;latest:TelemetrySample;points:TelemetryPoint[]};
export type TelemetrySnapshot={range:MetricRange;start:string;end:string;bucketSeconds:number;summary:{resources:number;proxmoxResources:number;containers:number;warningResources:number;sampleCount:number};series:TelemetrySeries[]};
export type TelemetryData={samples:TelemetrySample[]};
export type RawTelemetry={resourceId:string;name:string;type:TelemetryResourceType;source:'proxmox'|'docker';state:string;cpuPercent:number;memoryPercent:number|null;diskPercent:number|null;networkRxBytesTotal:number|null;networkTxBytesTotal:number|null;diskReadBytesTotal:number|null;diskWriteBytesTotal:number|null;collectedAt:string};
