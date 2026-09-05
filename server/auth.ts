import { timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import type { StructuredLogger } from './logging/logger.js';
import type { SecurityAuditService } from './security/service.js';
import { secretFromEnvironment } from './config/secrets.js';

export type AuthMode = 'disabled' | 'proxy';
export type Role = 'viewer' | 'operator' | 'admin';

export interface Identity {
  subject: string;
  name: string;
  email?: string;
  groups: string[];
  role: Role;
  service?: boolean;
}

export interface AuthConfig {
  mode: AuthMode;
  proxySecret?: string;
  adminGroups: string[];
  operatorGroups: string[];
  metricsToken?: string;
  labopsToken?: string;
}

const roleRank: Record<Role, number> = { viewer: 1, operator: 2, admin: 3 };

export function authConfigFromEnvironment(env: NodeJS.ProcessEnv = process.env): AuthConfig {
  const requestedMode = env.SENTINEL_AUTH_MODE || 'disabled';
  if (requestedMode !== 'disabled' && requestedMode !== 'proxy') throw new Error('SENTINEL_AUTH_MODE must be disabled or proxy');
  const mode: AuthMode = requestedMode;
  const config: AuthConfig = {
    mode,
    proxySecret: secretFromEnvironment(env, 'SENTINEL_AUTH_PROXY_SECRET'),
    adminGroups: list(env.SENTINEL_AUTH_ADMIN_GROUPS || 'sentinel-admins'),
    operatorGroups: list(env.SENTINEL_AUTH_OPERATOR_GROUPS || 'sentinel-operators'),
    metricsToken: secretFromEnvironment(env, 'SENTINEL_METRICS_TOKEN'),
    labopsToken: secretFromEnvironment(env, 'LABOPS_EXPORT_TOKEN')
  };
  if (mode === 'proxy' && !strongSecret(config.proxySecret)) throw new Error('SENTINEL_AUTH_PROXY_SECRET must contain at least 32 characters in proxy mode');
  if (config.metricsToken && !strongSecret(config.metricsToken)) throw new Error('SENTINEL_METRICS_TOKEN must contain at least 32 characters when configured');
  return config;
}

export function authenticate(config: AuthConfig, log: StructuredLogger, audit?: SecurityAuditService) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (config.mode === 'disabled') {
      res.locals.identity = { subject: 'local', name: 'Local administrator', groups: [], role: 'admin' } satisfies Identity;
      return next();
    }

    const service = serviceIdentity(req, config);
    if (service) {
      res.locals.identity = service;
      return next();
    }

    const suppliedSecret = header(req, 'x-sentinel-proxy-secret');
    if (!secureEqual(suppliedSecret, config.proxySecret)) {
      log.warn('authentication_failed', { method: req.method, path: req.path, reason: 'untrusted_proxy' });
      audit?.record({ type: 'authentication_failed', severity: 'warning', method: req.method, path: req.path, reason: 'untrusted_proxy', sourceIp: req.socket.remoteAddress });
      return res.status(401).json({ error: 'Authentication required' });
    }

    const subject = header(req, 'x-forwarded-user');
    if (!subject) {
      log.warn('authentication_failed', { method: req.method, path: req.path, reason: 'missing_identity' });
      audit?.record({ type: 'authentication_failed', severity: 'warning', method: req.method, path: req.path, reason: 'missing_identity', sourceIp: req.socket.remoteAddress });
      return res.status(401).json({ error: 'Authenticated user header is missing' });
    }
    const groups = list(header(req, 'x-forwarded-groups'));
    const identity: Identity = {
      subject,
      name: header(req, 'x-forwarded-name') || subject,
      email: header(req, 'x-forwarded-email') || undefined,
      groups,
      role: resolveRole(groups, config)
    };
    res.locals.identity = identity;
    if (req.path === '/api/session') audit?.record({ type: 'session_authenticated', severity: 'info', subject: identity.subject, role: identity.role, method: req.method, path: req.path, sourceIp: trustedSourceIp(req) });
    return next();
  };
}

export function authorize(log: StructuredLogger, audit?: SecurityAuditService) {
  return (req: Request, res: Response, next: NextFunction) => {
    const identity = res.locals.identity as Identity | undefined;
    if (!identity) return res.status(401).json({ error: 'Authentication required' });
    const required = requiredRole(req);
    if (roleRank[identity.role] < roleRank[required]) {
      log.warn('authorization_denied', { subject: identity.subject, role: identity.role, requiredRole: required, method: req.method, path: req.path });
      audit?.record({ type: 'authorization_denied', severity: 'warning', subject: identity.subject, role: identity.role, requiredRole: required, method: req.method, path: req.path, sourceIp: trustedSourceIp(req) });
      return res.status(403).json({ error: `${required} role required`, requiredRole: required });
    }
    return next();
  };
}

export function session(config: AuthConfig, identity: Identity) {
  return { mode: config.mode, user: identity, permissions: { operate: roleRank[identity.role] >= roleRank.operator, administer: identity.role === 'admin' } };
}

function requiredRole(req: Request): Role {
  if (req.path.startsWith('/api/security/') || req.path.startsWith('/api/backups') || req.path.startsWith('/api/recovery/')) return 'admin';
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return 'viewer';
  const operatorRoutes = [
    /^\/api\/runs$/,
    /^\/api\/monitors\/(run-all|[^/]+\/run)$/,
    /^\/api\/alerts\/[^/]+\/suppress$/,
    /^\/api\/incidents\/[^/]+\/acknowledge$/,
    /^\/api\/notifications\/[^/]+\/retry$/,
    /^\/api\/integrations\/servicenow\/(cmdb\/sync|changes)$/,
    /^\/api\/proxmox\/operations\/collect$/,
    /^\/api\/pbs\/health\/collect$/,
    /^\/api\/topology\/mappings(?:\/[^/]+)?$/,
    /^\/api\/infrastructure\/metrics\/collect$/,
    /^\/api\/cmdb\/reconcile$/,
    /^\/api\/hardware\/(discover|maintenance(?:\/[^/]+)?|baselines\/[^/]+)$/
  ];
  return operatorRoutes.some(pattern => pattern.test(req.path)) ? 'operator' : 'admin';
}

function resolveRole(groups: string[], config: AuthConfig): Role {
  if (groups.some(group => config.adminGroups.includes(group))) return 'admin';
  if (groups.some(group => config.operatorGroups.includes(group))) return 'operator';
  return 'viewer';
}

function serviceIdentity(req: Request, config: AuthConfig): Identity | null {
  const token = bearer(req);
  if (req.path === '/metrics' && secureEqual(token, config.metricsToken)) return { subject: 'prometheus', name: 'Prometheus scraper', groups: [], role: 'viewer', service: true };
  if (req.path === '/api/integrations/labops/v1/snapshot' && secureEqual(token, config.labopsToken)) return { subject: 'labops', name: 'LabOps integration', groups: [], role: 'viewer', service: true };
  return null;
}

function bearer(req: Request) {
  return header(req, 'authorization').replace(/^Bearer\s+/i, '');
}

function header(req: Request, name: string) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] || '' : String(value || '').trim();
}

function list(value = '') {
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function strongSecret(value?: string) {
  return Boolean(value && Buffer.byteLength(value) >= 32);
}

function secureEqual(actual?: string, expected?: string) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual); const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function trustedSourceIp(req: Request) {
  return header(req, 'x-forwarded-for').split(',')[0]?.trim() || req.socket.remoteAddress;
}
