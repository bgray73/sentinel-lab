export type HardwareSource='redfish'|'snmp';
export type HardwareCategory='physical_server'|'switch'|'router'|'ups'|'pdu'|'storage_appliance'|'other';
export type HardwareHealth='healthy'|'warning'|'critical'|'unknown';
export type HardwareComponent={id:string;name:string;type:'temperature'|'fan'|'power_supply'|'drive'|'controller'|'interface'|'battery'|'other';health:HardwareHealth;value?:number;unit?:string;detail?:string};
export type HardwareDevice={id:string;externalId:string;name:string;source:HardwareSource;category:HardwareCategory;health:HardwareHealth;status:string;manufacturer?:string;model?:string;serialNumber?:string;firmwareVersion?:string;managementAddress:string;metrics:{powerWatts?:number;powerCapacityWatts?:number;temperatureCelsius?:number;memoryGiB?:number;processors?:number;uptimeSeconds?:number;interfaces?:number;interfacesUp?:number;interfaceCount?:number;interfaceErrors?:number;inputErrors?:number;outputErrors?:number;batteryMinutesRemaining?:number;batteryChargePercent?:number;loadPercent?:number};components:HardwareComponent[];attributes:Record<string,string|number|boolean|null>;collectedAt:string};
export type HardwareInventory={mode:'simulation'|'live';collectedAt:string;devices:HardwareDevice[];summary:{devices:number;servers:number;networkDevices:number;powerDevices:number;healthy:number;warnings:number;critical:number;components:number}};
export type RedfishTarget={id:string;name:string;url:string;username:string;password:string};
export type SnmpTarget={id:string;name:string;target:string;category:HardwareCategory;module:string;auth:string};
