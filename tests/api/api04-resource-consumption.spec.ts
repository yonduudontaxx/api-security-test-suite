import { expect, test } from '@playwright/test';
import { bearer, createUser } from '../support/api.js';

test.describe('API4:2023 Unrestricted Resource Consumption', { tag: '@API4' }, () => {
  test('a reasonable page size is served', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.get('/api/v1/orders', { headers: bearer(user.token), params: { limit: 50 } });

    expect(response.status()).toBe(200);
  });

  for (const limit of ['1000000', '-1', '0', 'NaN']) {
    test(`page size limit=${limit} is rejected`, async ({ request }) => {
      const user = await createUser(request);

      const response = await request.get('/api/v1/orders', { headers: bearer(user.token), params: { limit } });

      expect(response.status()).toBe(400);
    });
  }

  test('an oversized request body is rejected before processing', async ({ request }) => {
    const user = await createUser(request);
    const items = Array.from({ length: 20_000 }, () => ({ sku: 'SKU-PEN', quantity: 1 }));

    const response = await request.post('/api/v1/orders', { headers: bearer(user.token), data: { items } });

    expect(response.status()).toBe(413);
  });

  test('an order with an excessive number of line items is rejected', async ({ request }) => {
    const user = await createUser(request);
    const items = Array.from({ length: 200 }, () => ({ sku: 'SKU-PEN', quantity: 1 }));

    const response = await request.post('/api/v1/orders', { headers: bearer(user.token), data: { items } });

    expect(response.status()).toBe(400);
  });

  test('a burst of requests from one user is rate limited', async ({ request }) => {
    const user = await createUser(request);

    const statuses: number[] = [];
    for (let batch = 0; batch < 6; batch += 1) {
      const responses = await Promise.all(
        Array.from({ length: 25 }, () => request.get('/api/v1/users/me', { headers: bearer(user.token) })),
      );
      statuses.push(...responses.map((response) => response.status()));
    }
    const limited = await request.get('/api/v1/users/me', { headers: bearer(user.token) });

    expect(statuses).toContain(429);
    expect(limited.status()).toBe(429);
    expect(Number(limited.headers()['retry-after'])).toBeGreaterThan(0);
  });
});
