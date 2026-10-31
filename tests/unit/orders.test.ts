import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig, type SecurityMode } from '../../src/config.js';

let app: FastifyInstance;

afterEach(async () => {
  await app.close();
});

async function orderFor(mode: SecurityMode): Promise<{ id: string; headers: Record<string, string> }> {
  app = buildApp(loadConfig({ SECURITY_MODE: mode, JWT_SECRET: 'unit-test-secret-'.repeat(4) }));
  const credentials = { username: 'coupon-user', password: 'unit-test-password' };
  await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { ...credentials, email: 'c@example.test' } });
  const login = await app.inject({ method: 'POST', url: '/api/v1/auth/login', payload: credentials });
  const headers = { authorization: `Bearer ${login.json<{ token: string }>().token}` };
  const order = await app.inject({
    method: 'POST',
    url: '/api/v1/orders',
    headers,
    payload: { items: [{ sku: 'SKU-BOOK', quantity: 1 }] },
  });
  return { id: order.json<{ id: string }>().id, headers };
}

describe('POST /orders/:orderId/coupon', () => {
  it.each([
    ['hardened', '__proto__'],
    ['hardened', 'constructor'],
    ['hardened', 'toString'],
    ['vulnerable', '__proto__'],
    ['vulnerable', 'constructor'],
    ['vulnerable', 'toString'],
  ] as const)('in %s mode rejects the inherited property name %s as a coupon code', async (mode, code) => {
    const order = await orderFor(mode);

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/orders/${order.id}/coupon`,
      headers: order.headers,
      payload: { code },
    });

    expect(response.statusCode).toBe(404);
  });
});

describe('POST /orders', () => {
  it.each(['hardened', 'vulnerable'] as const)('in %s mode rejects an inherited property name as a sku', async (mode) => {
    const order = await orderFor(mode);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/orders',
      headers: order.headers,
      payload: { items: [{ sku: 'constructor', quantity: 1 }] },
    });

    expect(response.statusCode).toBe(400);
  });
});
