import type { HardwareDevice, HardwareInventory } from './types.js';

export function summarizeHardware(devices: HardwareDevice[], mode: HardwareInventory['mode']): HardwareInventory {
  return {
    mode,
    collectedAt: new Date().toISOString(),
    devices,
    summary: {
      devices: devices.length,
      healthy: devices.filter(device => device.health === 'healthy').length,
      warnings: devices.filter(device => device.health === 'warning').length,
      critical: devices.filter(device => device.health === 'critical').length,
      servers: devices.filter(device => device.category === 'physical_server').length,
      networkDevices: devices.filter(device => ['switch', 'router'].includes(device.category)).length,
      powerDevices: devices.filter(device => ['ups', 'pdu'].includes(device.category)).length,
      components: devices.reduce((total, device) => total + device.components.length, 0),
    },
  };
}

export function simulatedHardwareInventory(): HardwareInventory {
  const collectedAt = new Date().toISOString();
  const devices: HardwareDevice[] = [
    { id:'dell-r640-01', externalId:'hardware/dell-r640-01', name:'pve-01', source:'redfish', category:'physical_server', health:'healthy', status:'On', manufacturer:'Dell Inc.', model:'PowerEdge R640', serialNumber:'SIM-R640-01', firmwareVersion:'7.10.0', managementAddress:'idrac-pve-01.lab', metrics:{powerWatts:286,powerCapacityWatts:750,temperatureCelsius:42,memoryGiB:256,processors:2}, components:[{id:'cpu-temp',name:'CPU temperature',type:'temperature',health:'healthy',value:42,unit:'°C'},{id:'psu-1',name:'Power Supply 1',type:'power_supply',health:'healthy',value:292,unit:'W'},{id:'raid',name:'PERC H740P',type:'controller',health:'healthy'}], attributes:{hostName:'pve-01',processorModel:'Intel Xeon Gold 6130'}, collectedAt },
    { id:'dell-r440-02', externalId:'hardware/dell-r440-02', name:'pve-02', source:'redfish', category:'physical_server', health:'warning', status:'On', manufacturer:'Dell Inc.', model:'PowerEdge R440', serialNumber:'SIM-R440-02', firmwareVersion:'6.10.1', managementAddress:'idrac-pve-02.lab', metrics:{powerWatts:238,powerCapacityWatts:550,temperatureCelsius:51,memoryGiB:128,processors:2}, components:[{id:'inlet',name:'System Board Inlet Temp',type:'temperature',health:'warning',value:51,unit:'°C',detail:'Above preferred lab threshold'},{id:'psu-1',name:'Power Supply 1',type:'power_supply',health:'healthy',value:241,unit:'W'}], attributes:{hostName:'pve-02',processorModel:'Intel Xeon Silver 4114'}, collectedAt },
    { id:'supermicro-storage', externalId:'hardware/supermicro-storage', name:'storage-01', source:'redfish', category:'storage_appliance', health:'healthy', status:'On', manufacturer:'Supermicro', model:'SuperServer 6029P', serialNumber:'SIM-SM-01', managementAddress:'bmc-storage-01.lab', metrics:{powerWatts:318,temperatureCelsius:39,memoryGiB:128,processors:2}, components:[{id:'hba',name:'Broadcom HBA',type:'controller',health:'healthy'},{id:'disk-1',name:'Disk bay 1',type:'drive',health:'healthy',detail:'7.68 TB SSD'}], attributes:{hostName:'storage-01'}, collectedAt },
    { id:'nexus-core-01', externalId:'hardware/nexus-core-01', name:'nexus-core-01', source:'snmp', category:'switch', health:'healthy', status:'up', manufacturer:'Cisco', model:'Nexus 93180YC-FX', managementAddress:'10.20.0.2', metrics:{uptimeSeconds:8_942_400,interfaceCount:54,interfaceErrors:0}, components:[{id:'if-1',name:'Ethernet1/1',type:'interface',health:'healthy',detail:'up'},{id:'fan',name:'Fan tray',type:'fan',health:'healthy'}], attributes:{module:'if_mib,cisco_nxos'}, collectedAt },
    { id:'cyberpower-ups-01', externalId:'hardware/cyberpower-ups-01', name:'rack-ups-01', source:'snmp', category:'ups', health:'healthy', status:'online', manufacturer:'CyberPower', model:'OL3000RTXL2U', managementAddress:'10.20.0.20', metrics:{batteryChargePercent:100,loadPercent:38,uptimeSeconds:2_592_000}, components:[{id:'battery',name:'Battery charge',type:'battery',health:'healthy',value:100,unit:'%'},{id:'load',name:'Output load',type:'other',health:'healthy',value:38,unit:'%'}], attributes:{module:'ups_mib'}, collectedAt },
  ];
  return summarizeHardware(devices, 'simulation');
}
