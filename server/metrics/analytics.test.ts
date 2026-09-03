import { describe,expect,it } from 'vitest';
import { buildMetrics,prometheusMetrics } from './analytics.js';
import type { MonitorResult,MonitorView } from '../monitoring/types.js';

const now=new Date('2026-09-03T12:00:00Z').getTime();
const monitor:MonitorView={id:'monitor-web',name:'Web "UI"',protocol:'http',target:'https://example.test',intervalSeconds:60,timeoutMs:5000,enabled:true,createdAt:new Date(now).toISOString(),healthScore:90,uptimePercent:90,lastResult:{id:'r2',monitorId:'monitor-web',status:'down',latencyMs:400,detail:'timeout',checkedAt:new Date(now-60_000).toISOString()}};
const results:MonitorResult[]=[monitor.lastResult!,{id:'r1',monitorId:'monitor-web',status:'up',latencyMs:100,detail:'ok',checkedAt:new Date(now-120_000).toISOString()}];

describe('historical metrics',()=>{
  it('aggregates availability and latency into time buckets',()=>{const metrics=buildMetrics([monitor],results,[],[],{days:30,maxResults:25_000},'1h',now);expect(metrics.overall).toMatchObject({checks:2,failures:1,availabilityPercent:50,avgLatencyMs:250,p95LatencyMs:400});expect(metrics.series[0].points.filter(point=>point.checks)).toHaveLength(1);});
  it('exports escaped Prometheus labels and current gauges',()=>{const output=prometheusMetrics([monitor],results,[],[],'simulation');expect(output).toContain('name="Web \\"UI\\""');expect(output).toContain('sentinel_monitor_up{');expect(output).toContain('sentinel_monitor_results_retained 2');});
});
