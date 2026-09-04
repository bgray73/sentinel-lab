import path from 'node:path';
import { simulatedHardwareInventory, summarizeHardware } from './inventory.js';
import { evaluateHardware, hardwareThresholdsFromEnvironment, reconcileFindings } from './operations.js';
import { discoverRedfish, redfishTargetsFromEnvironment } from './redfish.js';
import { discoverSnmp, snmpConfigFromEnvironment } from './snmp.js';
import { HardwareOperationsStore } from './store.js';
import type { FirmwareBaseline, HardwareDevice, HardwareInventory, HardwareOperationsData, MaintenanceWindow } from './types.js';

export class HardwareService {
  private inventoryValue: HardwareInventory = simulatedHardwareInventory();
  private readonly live: boolean;
  private readonly intervalSeconds: number;
  private readonly timeoutMs: number;
  private readonly operationsStore: HardwareOperationsStore;
  private readonly thresholds;
  private operationsData:HardwareOperationsData={findings:[],maintenanceWindows:[],firmwareBaselines:[]};
  private lastError = '';
  readonly ready: Promise<void>;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.live = env.SENTINEL_REAL_HARDWARE === 'true';
    this.intervalSeconds = Number(env.SENTINEL_HARDWARE_DISCOVERY_INTERVAL_SECONDS || 300);
    this.timeoutMs = Number(env.SENTINEL_HARDWARE_TIMEOUT_MS || 8000);
    this.thresholds=hardwareThresholdsFromEnvironment(env);
    this.operationsStore=new HardwareOperationsStore(env.SENTINEL_HARDWARE_OPERATIONS_FILE||path.resolve('.sentinel/hardware-operations.json'));
    if (!Number.isInteger(this.intervalSeconds) || this.intervalSeconds < 60 || this.intervalSeconds > 86_400) throw new Error('Hardware discovery interval must be between 60 and 86400 seconds');
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1000 || this.timeoutMs > 60_000) throw new Error('Hardware timeout must be between 1000 and 60000 milliseconds');
    this.ready = this.initialize();
  }

  private async initialize() {
    this.operationsData=await this.operationsStore.load();
    await this.refresh();
    const timer = setInterval(() => void this.refresh().catch(error=>{this.lastError=error instanceof Error?error.message:'Hardware discovery failed'}), this.intervalSeconds * 1000);
    timer.unref();
  }

  status() {
    let redfishTargets = 0; let snmpTargets = 0;
    try { redfishTargets = redfishTargetsFromEnvironment(this.env).length; } catch { redfishTargets = 0; }
    try { snmpTargets = snmpConfigFromEnvironment(this.env).targets.length; } catch { snmpTargets = 0; }
    return { mode: this.live ? 'live' : 'simulation', intervalSeconds:this.intervalSeconds, lastCollectedAt:this.inventoryValue.collectedAt, lastError:this.lastError, redfishTargets, snmpTargets };
  }

  inventory() { return this.inventoryValue; }
  operations(){const now=new Date();const active=this.operationsData.findings.filter(item=>item.status==='active');return{findings:this.operationsData.findings,maintenanceWindows:this.operationsData.maintenanceWindows,firmwareBaselines:this.operationsData.firmwareBaselines,summary:{active:active.length,critical:active.filter(item=>item.severity==='critical'&&!item.suppressed).length,warnings:active.filter(item=>item.severity==='warning'&&!item.suppressed).length,suppressed:active.filter(item=>item.suppressed).length,maintenance:this.operationsData.maintenanceWindows.filter(item=>new Date(item.startsAt)<=now&&new Date(item.endsAt)>now).length,baselines:this.operationsData.firmwareBaselines.length}}}

  async addMaintenance(input:Record<string,unknown>){const deviceId=String(input.deviceId||'').trim();const reason=String(input.reason||'').trim();const startsAt=new Date(String(input.startsAt||new Date().toISOString()));const endsAt=new Date(String(input.endsAt||''));if((deviceId!=='*'&&!this.inventoryValue.devices.some(device=>device.id===deviceId))||!reason||reason.length>200||Number.isNaN(startsAt.getTime())||Number.isNaN(endsAt.getTime())||endsAt<=startsAt||endsAt.getTime()-startsAt.getTime()>30*86_400_000)throw new Error('Maintenance requires a valid device, reason, and window of at most 30 days');const window:MaintenanceWindow={id:`maintenance-${crypto.randomUUID()}`,deviceId,reason,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),createdAt:new Date().toISOString()};this.operationsData.maintenanceWindows.unshift(window);await this.evaluate();return window}
  async removeMaintenance(id:string){const before=this.operationsData.maintenanceWindows.length;this.operationsData.maintenanceWindows=this.operationsData.maintenanceWindows.filter(item=>item.id!==id);if(before===this.operationsData.maintenanceWindows.length)throw new Error('Maintenance window not found');await this.evaluate();return{removed:true}}
  async recordBaseline(deviceId:string){const device=this.inventoryValue.devices.find(item=>item.id===deviceId);if(!device)throw new Error('Hardware device not found');if(!device.firmwareVersion)throw new Error('Device does not report a firmware version');const baseline:FirmwareBaseline={deviceId,firmwareVersion:device.firmwareVersion,model:device.model||'',serialNumber:device.serialNumber||'',recordedAt:new Date().toISOString()};this.operationsData.firmwareBaselines=this.operationsData.firmwareBaselines.filter(item=>item.deviceId!==deviceId);this.operationsData.firmwareBaselines.push(baseline);await this.evaluate();return baseline}
  prometheus(){const label=(value:string)=>value.replace(/\\/g,'\\\\').replace(/"/g,'\\"').replace(/\n/g,'');const active=this.operationsData.findings.filter(item=>item.status==='active');return['# HELP sentinel_hardware_findings_active Active hardware findings by severity and suppression.','# TYPE sentinel_hardware_findings_active gauge',...['warning','critical'].flatMap(severity=>[false,true].map(suppressed=>`sentinel_hardware_findings_active{severity="${severity}",suppressed="${suppressed}"} ${active.filter(item=>item.severity===severity&&item.suppressed===suppressed).length}`)),...this.inventoryValue.devices.map(device=>`sentinel_hardware_device_health{device="${label(device.name)}",device_id="${label(device.id)}",category="${device.category}",health="${device.health}"} 1`)].join('\n')+'\n'}

  async refresh() {
    if (!this.live) { this.inventoryValue = simulatedHardwareInventory(); this.lastError = ''; await this.evaluate(); return this.inventoryValue; }
    const redfish = redfishTargetsFromEnvironment(this.env);
    const snmp = snmpConfigFromEnvironment(this.env);
    if (!redfish.length && !snmp.targets.length) throw new Error('Live hardware discovery requires a Redfish or SNMP target');
    const attempts = await Promise.allSettled([
      ...redfish.map(target => discoverRedfish(target, this.timeoutMs)),
      ...snmp.targets.map(target => discoverSnmp(snmp.exporter!, target, this.timeoutMs)),
    ]);
    const devices = attempts.filter((result): result is PromiseFulfilledResult<HardwareDevice> => result.status === 'fulfilled').map(result => result.value);
    const errors = attempts.filter((result): result is PromiseRejectedResult => result.status === 'rejected').map(result => result.reason instanceof Error ? result.reason.message : 'Hardware discovery failed');
    if (!devices.length && errors.length) { this.lastError = errors.join('; '); throw new Error(this.lastError); }
    this.inventoryValue = summarizeHardware(devices, 'live');
    this.lastError = errors.join('; ');
    await this.evaluate();
    return this.inventoryValue;
  }

  private async evaluate(){this.operationsData.maintenanceWindows=this.operationsData.maintenanceWindows.filter(item=>new Date(item.endsAt).getTime()>Date.now()-90*86_400_000);const candidates=evaluateHardware(this.inventoryValue,this.operationsData.firmwareBaselines,this.thresholds);this.operationsData.findings=reconcileFindings(candidates,this.operationsData.findings,this.operationsData.maintenanceWindows);await this.operationsStore.save(this.operationsData)}
}
