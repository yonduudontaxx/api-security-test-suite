import { expect, test } from '@playwright/test';
import { bearer, createUser } from '../support/api.js';
import { ALLOWED_CORS_ORIGIN } from '../support/env.js';

test.describe('API8:2023 Security Misconfiguration', { tag: '@API8' }, () => {
  test('responses carry defensive security headers', async ({ request }) => {
    const user = await createUser(request);

    const headers = (await request.get('/api/v1/users/me', { headers: bearer(user.token) })).headers();

    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['cache-control']).toContain('no-store');
    expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(headers['x-frame-options']).toBe('DENY');
  });

  test('responses do not disclose server technology or versions', async ({ request }) => {
    const headers = (await request.get('/health')).headers();

    expect(headers).not.toHaveProperty('x-powered-by');
    expect(headers.server ?? '').not.toMatch(/\d/);
  });

  test('CORS does not trust an arbitrary origin', async ({ request }) => {
    const response = await request.get('/health', { headers: { origin: 'https://evil.example' } });

    expect(response.headers()['access-control-allow-origin']).toBeUndefined();
    expect(response.headers()['access-control-allow-credentials']).toBeUndefined();
  });

  test('CORS preflight from the allowlisted origin is granted', async ({ request }) => {
    const response = await request.fetch('/api/v1/users/me', {
      method: 'OPTIONS',
      headers: { origin: ALLOWED_CORS_ORIGIN, 'access-control-request-method': 'GET' },
    });

    expect(response.status()).toBe(204);
    expect(response.headers()['access-control-allow-origin']).toBe(ALLOWED_CORS_ORIGIN);
  });

  test('malformed JSON produces a generic error without internals', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.post('/api/v1/orders', {
      headers: { ...bearer(user.token), 'content-type': 'application/json' },
      data: '{"items": [',
    });
    const body = await response.text();

    expect(response.status()).toBe(400);
    expect(body).not.toContain('stack');
    expect(body).not.toMatch(/node_modules|\.ts:\d+|at \w+ \(/);
  });

  test('unknown routes do not echo the request back', async ({ request }) => {
    const response = await request.get('/api/v1/%3Cscript%3Ealert(1)%3C%2Fscript%3E');

    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain('<script>');
  });
});
