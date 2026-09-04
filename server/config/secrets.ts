import { readFileSync } from 'node:fs';

const maximumSecretBytes = 65_536;

/** Read NAME directly, or NAME_FILE when the direct value is absent. */
export function secretFromEnvironment(env: NodeJS.ProcessEnv, name: string) {
  const direct = env[name];
  if (direct !== undefined && direct !== '') return direct;
  const file = env[`${name}_FILE`];
  if (!file) return undefined;
  const content = readFileSync(file);
  if (content.byteLength > maximumSecretBytes) throw new Error(`${name}_FILE exceeds 64 KiB`);
  const value = content.toString('utf8').replace(/[\r\n]+$/, '');
  if (!value) throw new Error(`${name}_FILE is empty`);
  return value;
}
