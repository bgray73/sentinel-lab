import type { AlertRule, Incident, MetricRange, MetricsSnapshot, MonitorMetricSeries, MonitorResult, MonitorView, RetentionPolicy } from '../monitoring/types.js';

const rangeConfig: Record<MetricRange,{milliseconds:number;bucketSeconds:number}> = {
  '1h': { milliseconds:3_600_000,bucketSeconds:300 }, '6h': { milliseconds:21_600_000,bucketSeconds:1_800 }, '24h': { milliseconds:86_400_000,bucketSeconds:3_600 }, '7d': { milliseconds:604_800_000,bucketSeconds:21_600 }, '30d': { milliseconds:2_592_000_000,bucketSeconds:86_400 }
};

export function isMetricRange(value:string):value is MetricRange { return value in rangeConfig; }
function percentile(values:number[],value:number) { if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*value)-1)]; }
function rounded(value:number) { return Math.round(value*100)/100; }

export function buildMetrics(monitors:MonitorView[],results:MonitorResult[],incidents:Incident[],rules:AlertRule[],retention:RetentionPolicy,range:MetricRange='24h',now=Date.now()):MetricsSnapshot {
  const config=rangeConfig[range]; const start=now-config.milliseconds; const bucketMs=config.bucketSeconds*1000; const bucketCount=Math.ceil(config.milliseconds/bucketMs);
  const relevant=results.filter(result=>{const checked=new Date(result.checkedAt).getTime();return checked>=start&&checked<=now;});
  const series=monitors.map(monitor=>{
    const monitorResults=relevant.filter(result=>result.monitorId===monitor.id); const points=Array.from({length:bucketCount},(_,index)=>({timestamp:new Date(start+index*bucketMs).toISOString(),checks:0,failures:0,availabilityPercent:null as number|null,avgLatencyMs:null as number|null}));
    const latencyBuckets:number[][]=Array.from({length:bucketCount},()=>[]);
    for(const result of monitorResults){const index=Math.min(bucketCount-1,Math.floor((new Date(result.checkedAt).getTime()-start)/bucketMs));if(index<0)continue;points[index].checks+=1;if(result.status==='down')points[index].failures+=1;latencyBuckets[index].push(result.latencyMs);}
    points.forEach((point,index)=>{if(!point.checks)return;point.availabilityPercent=rounded(((point.checks-point.failures)/point.checks)*100);point.avgLatencyMs=Math.round(latencyBuckets[index].reduce((sum,value)=>sum+value,0)/latencyBuckets[index].length);});
    const failures=monitorResults.filter(result=>result.status==='down').length;const latencies=monitorResults.map(result=>result.latencyMs);
    const currentStatus:MonitorMetricSeries['currentStatus']=monitor.lastResult?.status||'pending';
    return { monitorId:monitor.id,name:monitor.name,protocol:monitor.protocol,currentStatus,summary:{checks:monitorResults.length,failures,availabilityPercent:monitorResults.length?rounded(((monitorResults.length-failures)/monitorResults.length)*100):null,avgLatencyMs:latencies.length?Math.round(latencies.reduce((sum,value)=>sum+value,0)/latencies.length):null,p95LatencyMs:percentile(latencies,.95)},points };
  });
  const failures=relevant.filter(result=>result.status==='down').length;const latencies=relevant.map(result=>result.latencyMs);
  return {range,start:new Date(start).toISOString(),end:new Date(now).toISOString(),bucketSeconds:config.bucketSeconds,retainedResults:results.length,retention,overall:{checks:relevant.length,failures,availabilityPercent:relevant.length?rounded(((relevant.length-failures)/relevant.length)*100):null,avgLatencyMs:latencies.length?Math.round(latencies.reduce((sum,value)=>sum+value,0)/latencies.length):null,p95LatencyMs:percentile(latencies,.95),activeIncidents:incidents.filter(incident=>incident.status!=='resolved').length,enabledRules:rules.filter(rule=>rule.enabled).length},series};
}

function label(value:string){return value.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/"/g,'\\"');}
export function prometheusMetrics(monitors:MonitorView[],results:MonitorResult[],incidents:Incident[],rules:AlertRule[],mode:string) {
  const lines=['# HELP sentinel_monitor_up Whether the latest monitor check succeeded.','# TYPE sentinel_monitor_up gauge'];
  for(const monitor of monitors){const labels=`monitor_id="${label(monitor.id)}",name="${label(monitor.name)}",protocol="${monitor.protocol}"`;lines.push(`sentinel_monitor_up{${labels}} ${monitor.lastResult?.status==='up'?1:0}`);lines.push(`sentinel_monitor_latency_ms{${labels}} ${monitor.lastResult?.latencyMs??0}`);lines.push(`sentinel_monitor_health_score{${labels}} ${monitor.healthScore??0}`);lines.push(`sentinel_monitor_uptime_percent{${labels}} ${monitor.uptimePercent??0}`);}
  lines.push('# HELP sentinel_incidents_active Number of open or acknowledged incidents.','# TYPE sentinel_incidents_active gauge',`sentinel_incidents_active ${incidents.filter(incident=>incident.status!=='resolved').length}`,`sentinel_alert_rules_enabled ${rules.filter(rule=>rule.enabled).length}`,`sentinel_monitor_results_retained ${results.length}`,`sentinel_mode_info{mode="${label(mode)}"} 1`);return `${lines.join('\n')}\n`;
}
