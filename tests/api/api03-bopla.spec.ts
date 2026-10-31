import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { bearer, createUser } from '../support/api.js';

const SENSITIVE_FIELDS = ['passwordHash', 'resetToken', 'mfaSecret'];

test.describe('API3:2023 Broken Object Property Level Authorization', { tag: '@API3' }, () => {
  test('own profile does not expose credential material', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.get('/api/v1/users/me', { headers: bearer(user.token) });

    expect(response.status()).toBe(200);
    const body = await response.json();
    for (const field of SENSITIVE_FIELDS) expect(body).not.toHaveProperty(field);
  });

  test("another user's profile exposes only public fields", async ({ request }) => {
    const alice = await createUser(request, 'alice');
    const bob = await createUser(request, 'bob');

    const response = await request.get(`/api/v1/users/${alice.id}`, { headers: bearer(bob.token) });

    expect(response.status()).toBe(200);
    expect(Object.keys(await response.json()).sort()).toEqual(['displayName', 'id', 'username']);
  });

  test('profile update cannot escalate role or credit balance', async ({ request }) => {
    const user = await createUser(request);

    await request.patch('/api/v1/users/me', {
      headers: bearer(user.token),
      data: { displayName: 'Mallory', role: 'admin', balanceCents: 1_000_000 },
    });
    const me = await (await request.get('/api/v1/users/me', { headers: bearer(user.token) })).json();

    expect(me.role).toBe('user');
    expect(me.balanceCents).toBe(0);
  });

  test('legitimate profile fields can still be updated', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.patch('/api/v1/users/me', {
      headers: bearer(user.token),
      data: { displayName: 'Alice Example' },
    });

    expect(response.status()).toBe(200);
    expect((await response.json()).displayName).toBe('Alice Example');
  });

  test('registration rejects a client-supplied role', async ({ request }) => {
    const username = `reg-${randomUUID().slice(0, 8)}`;

    const response = await request.post('/api/v1/auth/register', {
      data: { username, email: `${username}@example.test`, password: `Pw-${randomUUID()}`, role: 'admin' },
    });

    expect(response.status()).toBe(400);
  });
});
