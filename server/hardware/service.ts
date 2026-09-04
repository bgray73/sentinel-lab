import { simulatedHardwareInventory, summarizeHardware } from './inventory.js';
import { discoverRedfish, redfishTargetsFromEnvironment } from './redfish.js';
import { discoverSnmp, snmpConfigFromEnvironment } from './snmp.js';
import type { HardwareDevice, HardwareInventory } from './types.js';

export class HardwareService {
  private inventoryValue: HardwareInventory = simulatedHardwareInventory();
  private readonly live: boolean;
  private readonly intervalSeconds: number;
  private readonly timeoutMs: number;
  private lastError = '';
  readonly ready: Promise<void>;

  constructor(private readonly env: NodeJS.ProcessEnv = process.env) {
    this.live = env.SENTINEL_REAL_HARDWARE === 'true';
    this.intervalSeconds = Number(env.SENTINEL_HARDWARE_DISCOVERY_INTERVAL_SECONDS || 300);
    this.timeoutMs = Number(env.SENTINEL_HARDWARE_TIMEOUT_MS || 8000);
    if (!Number.isInteger(this.intervalSeconds) || this.intervalSeconds < 60 || this.intervalSeconds > 86_400) throw new Error('Hardware discovery interval must be between 60 and 86400 seconds');
    if (!Number.isInteger(this.timeoutMs) || this.timeoutMs < 1000 || this.timeoutMs > 60_000) throw new Error('Hardware timeout must be between 1000 and 60000 milliseconds');
    this.ready = this.initialize();
  }

  private async initialize() {
    await this.refresh();
    const timer = setInterval(() => void this.refresh(), this.intervalSeconds * 1000);
    timer.unref();
  }

  status() {
    let redfishTargets = 0; let snmpTargets = 0;
    try { redfishTargets = redfishTargetsFromEnvironment(this.env).length; } catch { redfishTargets = 0; }
    try { snmpTargets = snmpConfigFromEnvironment(this.env).targets.length; } catch { snmpTargets = 0; }
    return { mode: this.live ? 'live' : 'simulation', intervalSeconds:this.intervalSeconds, lastCollectedAt:this.inventoryValue.collectedAt, lastError:this.lastError, redfishTargets, snmpTargets };
  }

  inventory() { return this.inventoryValue; }

  async refresh() {
    if (!this.live) { this.inventoryValue = simulatedHardwareInventory(); this.lastError = ''; return this.inventoryValue; }
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
    return this.inventoryValue;
  }
}
