import { expect, test } from '@playwright/test';
import { bearer, createOrder, createUser } from '../support/api.js';

test.describe('API1:2023 Broken Object Level Authorization', { tag: '@API1' }, () => {
  test('owner can read their own order', async ({ request }) => {
    const alice = await createUser(request, 'alice');
    const order = await createOrder(request, alice);

    const response = await request.get(`/api/v1/orders/${order.id}`, { headers: bearer(alice.token) });

    expect(response.status()).toBe(200);
    expect((await response.json()).id).toBe(order.id);
  });

  test("another user cannot read someone else's order by id", async ({ request }) => {
    const alice = await createUser(request, 'alice');
    const bob = await createUser(request, 'bob');
    const order = await createOrder(request, alice);

    const response = await request.get(`/api/v1/orders/${order.id}`, { headers: bearer(bob.token) });

    expect(response.status()).toBe(404);
    expect(await response.text()).not.toContain(alice.id);
  });

  test("another user cannot cancel someone else's order", async ({ request }) => {
    const alice = await createUser(request, 'alice');
    const bob = await createUser(request, 'bob');
    const order = await createOrder(request, alice);

    const attack = await request.delete(`/api/v1/orders/${order.id}`, { headers: bearer(bob.token) });
    const after = await request.get(`/api/v1/orders/${order.id}`, { headers: bearer(alice.token) });

    expect(attack.status()).toBe(404);
    expect((await after.json()).status).toBe('open');
  });

  test("order listing ignores an ownerId parameter pointing at another user", async ({ request }) => {
    const alice = await createUser(request, 'alice');
    const bob = await createUser(request, 'bob');
    await createOrder(request, alice);

    const response = await request.get('/api/v1/orders', {
      headers: bearer(bob.token),
      params: { ownerId: alice.id },
    });

    expect(response.status()).toBe(200);
    const page = await response.json();
    expect(page.items.filter((order: { ownerId: string }) => order.ownerId === alice.id)).toHaveLength(0);
  });

  test("a coupon cannot be applied to someone else's order", async ({ request }) => {
    const alice = await createUser(request, 'alice');
    const bob = await createUser(request, 'bob');
    const order = await createOrder(request, alice);

    const response = await request.post(`/api/v1/orders/${order.id}/coupon`, {
      headers: bearer(bob.token),
      data: { code: 'WELCOME10' },
    });

    expect(response.status()).toBe(404);
  });
});
