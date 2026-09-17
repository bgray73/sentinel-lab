import type { NetworkInterface } from '../network/types.js';
import type { DiscoveredCi, DiscoveredRelationship } from './types.js';

type Endpoint = { externalId: string; source: 'proxmox' | 'hardware'; name: string };

// Require an exact, unique endpoint name in the alias. Free-form descriptions
// can mention several hosts, so they must never create inferred connections.
export function discoverNetworkInterfaces(interfaces: NetworkInterface[], endpoints: Endpoint[]) {
  const items: DiscoveredCi[] = [];
  const relationships: DiscoveredRelationship[] = [];
  const unique = new Set<string>();
  for (const port of interfaces) {
    const externalId = `interface/${port.deviceId}/${port.ifIndex}`;
    if (unique.has(externalId)) continue;
    unique.add(externalId);
    items.push({
      externalId, class: 'network_interface', name: `${port.deviceName} ${port.name}`,
      source: 'network', status: port.operState,
      attributes: {
        deviceId: port.deviceId, ifIndex: port.ifIndex, interfaceName: port.name,
        alias: port.alias, adminState: port.adminState, operState: port.operState,
        health: port.health, speedMbps: port.speedMbps,
        managementAddress: port.managementAddress,
        utilizationPercent: port.utilizationPercent,
        errorsPerSecond: port.errorsPerSecond,
        discardsPerSecond: port.discardsPerSecond,
        flapsInWindow: port.flapsInWindow,
      },
    });
    relationships.push({ fromExternalId: `hardware/${port.deviceId}`, fromSource: 'hardware', toExternalId: externalId, toSource: 'network', type: 'contains', source: 'network' });
    const alias = port.alias.toLowerCase();
    if (!alias.trim()) continue;
    const matches = endpoints.filter(endpoint => {
      const name = endpoint.name.trim().toLowerCase();
      if (name.length < 4) return false;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`(^|[^a-z0-9-])${escaped}(?=$|[^a-z0-9-])`, 'i').test(alias);
    });
    if (matches.length === 1) relationships.push({ fromExternalId: externalId, fromSource: 'network', toExternalId: matches[0].externalId, toSource: matches[0].source, type: 'connected_to', source: 'network' });
  }
  return { items, relationships };
}
