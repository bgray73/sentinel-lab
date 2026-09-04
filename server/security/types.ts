import type { Role } from '../auth.js';

export type SecurityEventType = 'session_authenticated' | 'authentication_failed' | 'authorization_denied';

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: SecurityEventType;
  severity: 'info' | 'warning';
  subject?: string;
  role?: Role;
  method: string;
  path: string;
  sourceIp?: string;
  reason?: string;
  requiredRole?: Role;
}

export interface SecurityEventInput extends Omit<SecurityEvent, 'id' | 'timestamp'> {}

export interface SecurityAuditData { events: SecurityEvent[] }
