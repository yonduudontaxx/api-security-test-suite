import { expect, test } from '@playwright/test';
import { bearer, createUser } from '../support/api.js';

test.describe('API10:2023 Unsafe Consumption of APIs', { tag: '@API10' }, () => {
  test('a well-formed upstream partner profile is relayed', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.get('/api/v1/partners/acme', { headers: bearer(user.token) });

    expect(response.status()).toBe(200);
    expect(await response.json()).toEqual({
      id: 'acme',
      name: 'Acme Logistics',
      website: 'https://acme.example.test',
      discountPercent: 5,
    });
  });

  test('an upstream error is not relayed as a successful response', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.get('/api/v1/partners/unknown-partner', { headers: bearer(user.token) });

    expect(response.status()).toBe(404);
  });

  test('upstream data failing validation is not relayed to clients', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.get('/api/v1/partners/tampered', { headers: bearer(user.token) });
    const body = await response.text();

    expect(response.status()).toBe(502);
    expect(body).not.toContain('onerror');
    expect(body).not.toContain('javascript:');
  });

  test('upstream redirects are not followed', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.get('/api/v1/partners/redirect', { headers: bearer(user.token) });

    expect(response.status()).toBe(502);
    expect(await response.text()).not.toContain('jwtSecret');
  });

  test('oversized upstream responses are refused', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.get('/api/v1/partners/oversized', { headers: bearer(user.token) });

    expect(response.status()).toBe(502);
  });

  test('a slow upstream is cut off by a timeout', async ({ request }) => {
    const user = await createUser(request);
    const startedAt = Date.now();

    const response = await request.get('/api/v1/partners/slow', { headers: bearer(user.token), timeout: 8_000 });

    expect(response.status()).toBe(504);
    expect(Date.now() - startedAt).toBeLessThan(5_000);
  });
});
