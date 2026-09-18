import { createHash } from 'node:crypto';

export function networkInterfaceIncidentKey(deviceId: string, ifIndex: string) {
  return `network-interface-${createHash('sha256').update(`${deviceId}|${ifIndex}`).digest('hex').slice(0, 16)}`;
}
