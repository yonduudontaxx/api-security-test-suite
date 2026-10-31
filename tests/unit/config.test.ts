import { describe, expect, it } from 'vitest';
import { loadConfig } from '../../src/config.js';

describe('loadConfig', () => {
  it('generates a 256-bit JWT secret when none is configured', () => {
    expect(loadConfig({}).jwtSecret).toMatch(/^[0-9a-f]{64}$/);
  });

  it('rejects a configured JWT secret shorter than 32 characters', () => {
    expect(() => loadConfig({ JWT_SECRET: 'short-secret' })).toThrow('JWT_SECRET must be at least 32 characters');
  });

  it('accepts a configured JWT secret of 32 characters or more', () => {
    expect(loadConfig({ JWT_SECRET: 'x'.repeat(32) }).jwtSecret).toBe('x'.repeat(32));
  });
});
