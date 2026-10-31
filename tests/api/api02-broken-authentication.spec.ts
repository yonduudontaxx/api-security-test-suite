import { expect, test } from '@playwright/test';
import { bearer, craftToken, createUser, nowSeconds } from '../support/api.js';
import { JWT_SECRET } from '../support/env.js';

test.describe('API2:2023 Broken Authentication', { tag: '@API2' }, () => {
  test('requests without a token are rejected', async ({ request }) => {
    const response = await request.get('/api/v1/users/me');

    expect(response.status()).toBe(401);
  });

  test('a valid token is accepted', async ({ request }) => {
    const user = await createUser(request);

    const response = await request.get('/api/v1/users/me', { headers: bearer(user.token) });

    expect(response.status()).toBe(200);
  });

  for (const alg of ['none', 'None', 'NONE']) {
    test(`an unsigned token with alg=${alg} is rejected`, async ({ request }) => {
      const user = await createUser(request);
      const token = craftToken(
        { alg, typ: 'JWT' },
        { sub: user.id, role: 'admin', iat: nowSeconds(), exp: nowSeconds() + 600 },
      );

      const response = await request.get('/api/v1/users/me', { headers: bearer(token) });

      expect(response.status()).toBe(401);
    });
  }

  test('a token signed with a different key is rejected', async ({ request }) => {
    const user = await createUser(request);
    const token = craftToken(
      { alg: 'HS256', typ: 'JWT' },
      { sub: user.id, role: 'admin', iat: nowSeconds(), exp: nowSeconds() + 600 },
      'attacker-chosen-key',
    );

    const response = await request.get('/api/v1/users/me', { headers: bearer(token) });

    expect(response.status()).toBe(401);
  });

  test('a token whose payload was edited after signing is rejected', async ({ request }) => {
    const user = await createUser(request);
    const [header, , signature] = user.token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ sub: user.id, role: 'admin', iat: nowSeconds(), exp: nowSeconds() + 600 })).toString('base64url');

    const response = await request.get('/api/v1/users/me', { headers: bearer(`${header}.${forgedPayload}.${signature}`) });

    expect(response.status()).toBe(401);
  });

  test('an expired token is rejected even with a valid signature', async ({ request }) => {
    const user = await createUser(request);
    const token = craftToken(
      { alg: 'HS256', typ: 'JWT' },
      { sub: user.id, role: 'user', iat: nowSeconds() - 7200, exp: nowSeconds() - 3600 },
      JWT_SECRET,
    );

    const response = await request.get('/api/v1/users/me', { headers: bearer(token) });

    expect(response.status()).toBe(401);
  });

  test('repeated failed logins lock the account', async ({ request }) => {
    const user = await createUser(request);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await request.post('/api/v1/auth/login', {
        data: { username: user.username, password: `wrong-guess-${attempt}` },
      });
      expect(response.status()).toBe(401);
    }

    const locked = await request.post('/api/v1/auth/login', {
      data: { username: user.username, password: user.password },
    });

    expect(locked.status()).toBe(429);
    expect(locked.headers()['retry-after']).toBeTruthy();
  });

  test('login errors do not reveal whether the account exists', async ({ request }) => {
    const user = await createUser(request);

    const unknownUser = await request.post('/api/v1/auth/login', {
      data: { username: `ghost-${user.username}`, password: 'irrelevant-password' },
    });
    const wrongPassword = await request.post('/api/v1/auth/login', {
      data: { username: user.username, password: 'irrelevant-password' },
    });

    expect(unknownUser.status()).toBe(401);
    expect(wrongPassword.status()).toBe(401);
    expect(await unknownUser.json()).toEqual(await wrongPassword.json());
  });
});
