import { expect, test } from '@playwright/test';
import { bearer, createUser } from '../support/api.js';
import { API_PORT, UPSTREAM_URL } from '../support/env.js';

const BLOCKED_TARGETS = [
  { name: 'cloud metadata service', url: 'http://169.254.169.254/latest/meta-data/' },
  { name: 'the API itself on loopback', url: `http://127.0.0.1:${API_PORT}/health` },
  { name: 'localhost hostname', url: `http://localhost:${API_PORT}/health` },
  { name: 'IPv6 loopback', url: `http://[::1]:${API_PORT}/health` },
  { name: 'decimal-encoded loopback', url: `http://2130706433:${API_PORT}/health` },
  { name: 'local file scheme', url: 'file:///etc/passwd' },
  { name: 'credentials smuggled into an allowed origin', url: `http://admin:secret@${new URL(UPSTREAM_URL).host}/files/report.txt` },
];

test.describe('API7:2023 Server Side Request Forgery', { tag: '@API7' }, () => {
  test('a file on the allowlisted file service can be imported', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.post('/api/v1/files/import', {
      headers: bearer(user.token),
      data: { url: `${UPSTREAM_URL}/files/report.txt` },
    });

    expect(response.status()).toBe(201);
    expect((await response.json()).preview).toContain('quarterly report');
  });

  for (const target of BLOCKED_TARGETS) {
    test(`import from ${target.name} is refused`, async ({ request }) => {
      const user = await createUser(request);

      const response = await request.post('/api/v1/files/import', {
        headers: bearer(user.token),
        data: { url: target.url },
      });

      expect(response.status()).toBe(400);
      expect((await response.json()).error).toBe('url_not_allowed');
    });
  }

  test('a redirect from an allowlisted origin to an internal address is not followed', async ({ request }) => {
    const user = await createUser(request);
    const internal = `http://127.0.0.1:${API_PORT}/health`;

    const response = await request.post('/api/v1/files/import', {
      headers: bearer(user.token),
      data: { url: `${UPSTREAM_URL}/redirect?to=${encodeURIComponent(internal)}` },
    });

    expect(response.status()).toBe(400);
    expect(await response.text()).not.toContain('"status"');
  });
});
