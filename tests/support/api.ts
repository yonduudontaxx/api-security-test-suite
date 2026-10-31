import { createHmac, randomUUID } from 'node:crypto';
import { expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_PASSWORD } from './env.js';

export interface TestUser {
  id: string;
  username: string;
  password: string;
  token: string;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export async function login(request: APIRequestContext, username: string, password: string): Promise<string> {
  const response = await request.post('/api/v1/auth/login', { data: { username, password } });
  expect(response.status(), `login as ${username}`).toBe(200);
  return (await response.json()).token as string;
}

export async function createUser(request: APIRequestContext, prefix = 'user'): Promise<TestUser> {
  const username = `${prefix}-${randomUUID().slice(0, 8)}`;
  const password = `Pw-${randomUUID()}`;
  const response = await request.post('/api/v1/auth/register', {
    data: { username, email: `${username}@example.test`, password },
  });
  expect(response.status(), `register ${username}`).toBe(201);
  const { id } = await response.json();
  return { id, username, password, token: await login(request, username, password) };
}

export const loginAdmin = (request: APIRequestContext) => login(request, 'admin', ADMIN_PASSWORD);

export async function createOrder(
  request: APIRequestContext,
  user: TestUser,
  items = [{ sku: 'SKU-BOOK', quantity: 2 }],
): Promise<{ id: string; totalCents: number; subtotalCents: number }> {
  const response = await request.post('/api/v1/orders', { headers: bearer(user.token), data: { items } });
  expect(response.status()).toBe(201);
  return response.json();
}

const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

export function craftToken(header: object, payload: object, secret?: string): string {
  const unsigned = `${segment(header)}.${segment(payload)}`;
  const signature = secret ? createHmac('sha256', secret).update(unsigned).digest('base64url') : '';
  return `${unsigned}.${signature}`;
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);
