import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';

const ADMIN_PASSWORD = 'unit-test-admin-password';
let app: FastifyInstance;

afterEach(async () => {
  await app.close();
});

function start(env: Record<string, string> = {}): void {
  app = buildApp(
    loadConfig({ SECURITY_MODE: 'hardened', JWT_SECRET: 'unit-test-secret-'.repeat(4), ADMIN_PASSWORD, ...env }),
  );
}

function login(password: string, remoteAddress: string) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username: 'admin', password },
    remoteAddress,
  });
}

describe('per-account failure ceiling', () => {
  it('throttles the account from new addresses once failures across addresses reach the ceiling', async () => {
    start({ ACCOUNT_FAILURE_LIMIT_PER_HOUR: '50' });
    expect((await login(ADMIN_PASSWORD, '198.51.100.1')).statusCode).toBe(200);

    for (let failure = 0; failure < 50; failure += 1) {
      const response = await login('wrong-password', `203.0.113.${Math.floor(failure / 4) + 1}`);
      expect(response.statusCode).toBe(401);
    }

    const fromNewAddress = await login(ADMIN_PASSWORD, '192.0.2.77');
    const fromTrustedAddress = await login(ADMIN_PASSWORD, '198.51.100.1');

    expect(fromNewAddress.statusCode).toBe(429);
    expect(fromNewAddress.json()).toMatchObject({ error: 'account_throttled' });
    expect(Number(fromNewAddress.headers['retry-after'])).toBeGreaterThan(0);
    expect(Number(fromNewAddress.headers['retry-after'])).toBeLessThanOrEqual(3600);
    expect(fromTrustedAddress.statusCode).toBe(200);
  });

  it('does not throttle the account below the ceiling', async () => {
    start({ ACCOUNT_FAILURE_LIMIT_PER_HOUR: '50' });
    for (let failure = 0; failure < 49; failure += 1) await login('wrong-password', `203.0.113.${Math.floor(failure / 4) + 1}`);

    expect((await login(ADMIN_PASSWORD, '192.0.2.77')).statusCode).toBe(200);
  });
});

describe('per-address registration throttle', () => {
  it('rejects registrations from an address past the limit while other addresses can register', async () => {
    start({ REGISTRATION_LIMIT_PER_HOUR: '3' });
    const register = (username: string, remoteAddress: string) =>
      app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: { username, email: `${username}@example.test`, password: 'unit-test-password' },
        remoteAddress,
      });

    for (const name of ['sybil-1', 'sybil-2', 'sybil-3']) expect((await register(name, '203.0.113.9')).statusCode).toBe(201);
    const throttled = await register('sybil-4', '203.0.113.9');

    expect(throttled.statusCode).toBe(429);
    expect(Number(throttled.headers['retry-after'])).toBeGreaterThan(0);
    expect((await register('honest-1', '198.51.100.2')).statusCode).toBe(201);
  });
});
