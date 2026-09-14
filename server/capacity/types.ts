import type {TelemetryResourceType} from '../telemetry/types.js';

export type CapacityMetric='cpu'|'memory'|'disk';
export type CapacityForecastState='critical'|'warning'|'healthy'|'stable'|'insufficient';
export type CapacityConfidence='low'|'medium'|'high';
export type CapacityForecast={resourceId:string;name:string;type:TelemetryResourceType;source:'proxmox'|'docker';metric:CapacityMetric;currentPercent:number|null;slopePercentPerDay:number|null;projectedPercent:number|null;daysToThreshold:number|null;state:CapacityForecastState;confidence:CapacityConfidence;samples:number;spanDays:number;rSquared:number|null};
export type CapacityForecastSnapshot={mode:'simulation'|'live';evaluatedAt:string;policy:{thresholdPercent:number;horizonDays:number;warningDays:number;criticalDays:number;minimumSamples:number;minimumSpanDays:number};summary:{resources:number;forecasts:number;critical:number;warning:number;healthy:number;stable:number;insufficient:number;nearestDays:number|null};items:CapacityForecast[]};
