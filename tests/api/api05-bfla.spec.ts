import { expect, test } from '@playwright/test';
import { bearer, createUser, loginAdmin } from '../support/api.js';

test.describe('API5:2023 Broken Function Level Authorization', { tag: '@API5' }, () => {
  test('an admin can list users', async ({ request }) => {
    const token = await loginAdmin(request);

    const response = await request.get('/api/v1/admin/users', { headers: bearer(token) });

    expect(response.status()).toBe(200);
  });

  test('a regular user cannot list users through the admin API', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.get('/api/v1/admin/users', { headers: bearer(user.token) });

    expect(response.status()).toBe(403);
  });

  test('a regular user cannot delete accounts through the admin API', async ({ request }) => {
    const attacker = await createUser(request, 'mallory');
    const victim = await createUser(request, 'victim');

    const response = await request.delete(`/api/v1/admin/users/${victim.id}`, { headers: bearer(attacker.token) });
    const victimProfile = await request.get('/api/v1/users/me', { headers: bearer(victim.token) });

    expect(response.status()).toBe(403);
    expect(victimProfile.status()).toBe(200);
  });

  test('admin functions are not reachable by switching the HTTP method', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.fetch('/api/v1/admin/users', {
      method: 'GET',
      headers: { ...bearer(user.token), 'x-http-method-override': 'DELETE' },
    });

    expect(response.status()).toBe(403);
  });
});
