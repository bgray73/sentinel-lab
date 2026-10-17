import { describe, expect, it } from 'vitest';
import { validateDockerAction } from './actions.js';

describe('Docker action validation', () => {
  const id = 'a'.repeat(64);
  it('accepts supported actions with full container IDs', () => {
    expect(validateDockerAction('restart', id)).toEqual({ action: 'restart', containerId: id });
  });
  it('rejects unsupported actions and unsafe identifiers', () => {
    expect(() => validateDockerAction('delete', id)).toThrow();
    expect(() => validateDockerAction('stop', '../../containers')).toThrow();
    expect(() => validateDockerAction('stop', '')).toThrow();
  });
});
