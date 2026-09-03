import { testKinds, type TestCase } from './types.js';

export class ValidationError extends Error {}

export function validateTest(input: unknown): Omit<TestCase, 'id'> {
  if (!input || typeof input !== 'object') throw new ValidationError('Request body must be an object');
  const body = input as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const kind = body.kind;
  const target = typeof body.target === 'string' ? body.target.trim() : '';
  const critical = body.critical;
  const timeoutMs = body.timeoutMs;
  if (!name || name.length > 120) throw new ValidationError('Name is required and must be 120 characters or fewer');
  if (typeof kind !== 'string' || !testKinds.includes(kind as typeof testKinds[number])) throw new ValidationError('Unsupported test kind');
  if (typeof critical !== 'boolean') throw new ValidationError('critical must be true or false');
  if (!Number.isInteger(timeoutMs) || (timeoutMs as number) < 100 || (timeoutMs as number) > 30_000) throw new ValidationError('timeoutMs must be between 100 and 30000');
  try {
    const url = new URL(target);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    throw new ValidationError('Target must be a valid HTTP(S) URL');
  }
  return { name, kind: kind as TestCase['kind'], target, critical, timeoutMs: timeoutMs as number };
}

export function validateRun(input: unknown, knownIds: Set<string>) {
  if (input === undefined || input === null) return { simulate: true, ids: undefined as string[] | undefined };
  if (typeof input !== 'object') throw new ValidationError('Request body must be an object');
  const body = input as Record<string, unknown>;
  const simulate = body.simulate === undefined ? true : body.simulate;
  if (typeof simulate !== 'boolean') throw new ValidationError('simulate must be true or false');
  if (body.ids === undefined) return { simulate, ids: undefined as string[] | undefined };
  if (!Array.isArray(body.ids) || body.ids.length === 0 || body.ids.some(id => typeof id !== 'string')) throw new ValidationError('ids must be a non-empty array of test IDs');
  const ids = [...new Set(body.ids as string[])];
  const unknown = ids.filter(id => !knownIds.has(id));
  if (unknown.length) throw new ValidationError(`Unknown test IDs: ${unknown.join(', ')}`);
  return { simulate, ids };
}
