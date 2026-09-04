import type { FirmwareBaseline, HardwareDevice, HardwareFinding, HardwareInventory, HardwareThresholds, MaintenanceWindow } from './types.js';

export const defaultHardwareThresholds:HardwareThresholds={temperatureWarning:70,temperatureCritical:80,powerWarningPercent:80,powerCriticalPercent:90,upsRuntimeWarningMinutes:20,upsRuntimeCriticalMinutes:10,upsLoadWarningPercent:80,upsLoadCriticalPercent:90,interfaceErrorsWarning:100,interfaceErrorsCritical:10_000};

export function hardwareThresholdsFromEnvironment(env:NodeJS.ProcessEnv=process.env):HardwareThresholds{
  const value=(name:string,fallback:number)=>{const parsed=Number(env[name]??fallback);if(!Number.isFinite(parsed)||parsed<0)throw new Error(`${name} must be a non-negative number`);return parsed};
  const thresholds={temperatureWarning:value('HARDWARE_TEMPERATURE_WARNING_C',70),temperatureCritical:value('HARDWARE_TEMPERATURE_CRITICAL_C',80),powerWarningPercent:value('HARDWARE_POWER_WARNING_PERCENT',80),powerCriticalPercent:value('HARDWARE_POWER_CRITICAL_PERCENT',90),upsRuntimeWarningMinutes:value('HARDWARE_UPS_RUNTIME_WARNING_MINUTES',20),upsRuntimeCriticalMinutes:value('HARDWARE_UPS_RUNTIME_CRITICAL_MINUTES',10),upsLoadWarningPercent:value('HARDWARE_UPS_LOAD_WARNING_PERCENT',80),upsLoadCriticalPercent:value('HARDWARE_UPS_LOAD_CRITICAL_PERCENT',90),interfaceErrorsWarning:value('HARDWARE_INTERFACE_ERRORS_WARNING',100),interfaceErrorsCritical:value('HARDWARE_INTERFACE_ERRORS_CRITICAL',10_000)};
  if(thresholds.temperatureWarning>=thresholds.temperatureCritical||thresholds.powerWarningPercent>=thresholds.powerCriticalPercent||thresholds.upsRuntimeWarningMinutes<=thresholds.upsRuntimeCriticalMinutes||thresholds.upsLoadWarningPercent>=thresholds.upsLoadCriticalPercent||thresholds.interfaceErrorsWarning>=thresholds.interfaceErrorsCritical)throw new Error('Hardware warning and critical thresholds are inconsistent');
  return thresholds;
}

type Candidate=Omit<HardwareFinding,'id'|'status'|'suppressed'|'firstSeenAt'|'lastSeenAt'>;
const candidate=(device:HardwareDevice,kind:HardwareFinding['kind'],severity:HardwareFinding['severity'],title:string,detail:string,value?:number,unit?:string):Candidate=>({deviceId:device.id,deviceName:device.name,kind,severity,title,detail,value,unit});
const severity=(value:number,warning:number,critical:number,direction:'high'|'low'='high')=>direction==='high'?(value>=critical?'critical':value>=warning?'warning':null):(value<=critical?'critical':value<=warning?'warning':null);

export function evaluateHardware(inventory:HardwareInventory,baselines:FirmwareBaseline[]=[],thresholds:HardwareThresholds=defaultHardwareThresholds):Candidate[]{
  const findings:Candidate[]=[];
  for(const device of inventory.devices){
    if(device.health==='warning'||device.health==='critical')findings.push(candidate(device,'device_health',device.health,`${device.name} reports ${device.health} health`,`Device status is ${device.status}.`));
    for(const component of device.components)if(component.health==='warning'||component.health==='critical')findings.push(candidate(device,'component_health',component.health,`${device.name}: ${component.name}`,component.detail||`${component.type} reports ${component.health}.`,component.value,component.unit));
    const temperature=device.metrics.temperatureCelsius;if(temperature!==undefined){const level=severity(temperature,thresholds.temperatureWarning,thresholds.temperatureCritical);if(level)findings.push(candidate(device,'temperature',level,`${device.name} temperature is high`,`${temperature}°C exceeds the ${level} threshold.`,temperature,'°C'))}
    const {powerWatts,powerCapacityWatts}=device.metrics;if(powerWatts!==undefined&&powerCapacityWatts){const percent=Math.round(powerWatts/powerCapacityWatts*100);const level=severity(percent,thresholds.powerWarningPercent,thresholds.powerCriticalPercent);if(level)findings.push(candidate(device,'power_capacity',level,`${device.name} power utilization is high`,`${percent}% of reported power capacity is in use.`,percent,'%'))}
    if(device.category==='ups'&&device.metrics.batteryMinutesRemaining!==undefined){const minutes=device.metrics.batteryMinutesRemaining;const level=severity(minutes,thresholds.upsRuntimeWarningMinutes,thresholds.upsRuntimeCriticalMinutes,'low');if(level)findings.push(candidate(device,'ups_runtime',level,`${device.name} battery runtime is low`,`${minutes} minutes of estimated runtime remain.`,minutes,'minutes'))}
    if(['ups','pdu'].includes(device.category)&&device.metrics.loadPercent!==undefined){const load=device.metrics.loadPercent;const level=severity(load,thresholds.upsLoadWarningPercent,thresholds.upsLoadCriticalPercent);if(level)findings.push(candidate(device,'ups_load',level,`${device.name} load is high`,`${load}% output load is reported.`,load,'%'))}
    const errors=(device.metrics.inputErrors||0)+(device.metrics.outputErrors||0)+(device.metrics.interfaceErrors||0);if(errors){const level=severity(errors,thresholds.interfaceErrorsWarning,thresholds.interfaceErrorsCritical);if(level)findings.push(candidate(device,'interface_errors',level,`${device.name} reports interface errors`,`${errors} cumulative errors or discards were reported.`,errors,'errors'))}
    const baseline=baselines.find(item=>item.deviceId===device.id);if(baseline&&device.firmwareVersion&&baseline.firmwareVersion!==device.firmwareVersion)findings.push(candidate(device,'firmware_drift','warning',`${device.name} firmware changed`,`Baseline ${baseline.firmwareVersion}; discovered ${device.firmwareVersion}. Review and accept the change if planned.`));
  }
  return findings;
}

export function reconcileFindings(candidates:Candidate[],previous:HardwareFinding[],windows:MaintenanceWindow[],now=new Date()):HardwareFinding[]{
  const timestamp=now.toISOString();const activeWindows=windows.filter(window=>new Date(window.startsAt)<=now&&new Date(window.endsAt)>now);const observed=new Set<string>();const output:HardwareFinding[]=[];
  for(const item of candidates){const id=`hardware-finding/${item.deviceId}/${item.kind}/${slug(item.title)}`;observed.add(id);const old=previous.find(finding=>finding.id===id);output.push({...item,id,status:'active',suppressed:activeWindows.some(window=>window.deviceId==='*'||window.deviceId===item.deviceId),firstSeenAt:old?.firstSeenAt||timestamp,lastSeenAt:timestamp})}
  for(const old of previous)if(!observed.has(old.id))output.push(old.status==='resolved'?old:{...old,status:'resolved',suppressed:false,lastSeenAt:timestamp,resolvedAt:timestamp});
  return output.sort((a,b)=>Number(a.status==='resolved')-Number(b.status==='resolved')||Number(b.severity==='critical')-Number(a.severity==='critical')||b.lastSeenAt.localeCompare(a.lastSeenAt)).slice(0,2000);
}

const slug=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,80);
