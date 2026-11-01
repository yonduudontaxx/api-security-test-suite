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

  it.each(['RATE_LIMIT_PER_MINUTE', 'LOGIN_FAILURE_LIMIT_PER_MINUTE', 'ACCOUNT_FAILURE_LIMIT_PER_HOUR', 'REGISTRATION_LIMIT_PER_HOUR', 'TRUSTED_ADDRESS_TTL_DAYS'])(
    'rejects %s values that are not positive integers',
    (name) => {
      for (const value of ['0', '-1', '1.5', 'abc', '', ' 5', '1e3', '99999999999999999999']) {
        expect(() => loadConfig({ [name]: value })).toThrow(`${name} must be a positive integer`);
      }
    },
  );

  it('accepts positive integer limits', () => {
    const config = loadConfig({
      RATE_LIMIT_PER_MINUTE: '7',
      LOGIN_FAILURE_LIMIT_PER_MINUTE: '8',
      ACCOUNT_FAILURE_LIMIT_PER_HOUR: '9',
      REGISTRATION_LIMIT_PER_HOUR: '10',
      TRUSTED_ADDRESS_TTL_DAYS: '11',
    });

    expect([
      config.rateLimitPerMinute,
      config.loginFailureLimitPerMinute,
      config.accountFailureLimitPerHour,
      config.registrationLimitPerHour,
      config.trustedAddressTtlDays,
    ]).toEqual([7, 8, 9, 10, 11]);
  });

  it('caps TRUSTED_ADDRESS_TTL_DAYS at 365', () => {
    expect(loadConfig({ TRUSTED_ADDRESS_TTL_DAYS: '365' }).trustedAddressTtlDays).toBe(365);
    for (const value of ['366', '1000']) {
      expect(() => loadConfig({ TRUSTED_ADDRESS_TTL_DAYS: value })).toThrow(
        `TRUSTED_ADDRESS_TTL_DAYS must be at most 365, got "${value}"`,
      );
    }
  });
});
