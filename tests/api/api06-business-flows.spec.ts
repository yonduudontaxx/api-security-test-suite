import { expect, test } from '@playwright/test';
import { bearer, createOrder, createUser } from '../support/api.js';

test.describe('API6:2023 Unrestricted Access to Sensitive Business Flows', { tag: '@API6' }, () => {
  test('a single-use coupon applies a discount once', async ({ request }) => {
    const user = await createUser(request);
    const order = await createOrder(request, user);

    const response = await request.post(`/api/v1/orders/${order.id}/coupon`, {
      headers: bearer(user.token),
      data: { code: 'WELCOME10' },
    });

    expect(response.status()).toBe(200);
    expect((await response.json()).totalCents).toBe(Math.round(order.subtotalCents * 0.9));
  });

  test('a single-use coupon cannot be redeemed again on a second order', async ({ request }) => {
    const user = await createUser(request);
    const first = await createOrder(request, user);
    const second = await createOrder(request, user);

    await request.post(`/api/v1/orders/${first.id}/coupon`, { headers: bearer(user.token), data: { code: 'WELCOME10' } });
    const reuse = await request.post(`/api/v1/orders/${second.id}/coupon`, {
      headers: bearer(user.token),
      data: { code: 'WELCOME10' },
    });

    expect(reuse.status()).toBe(409);
  });

  test('concurrent redemptions of a single-use coupon succeed exactly once', async ({ request }) => {
    const user = await createUser(request);
    const orders = await Promise.all(Array.from({ length: 8 }, () => createOrder(request, user)));

    const responses = await Promise.all(
      orders.map((order) =>
        request.post(`/api/v1/orders/${order.id}/coupon`, { headers: bearer(user.token), data: { code: 'WELCOME10' } }),
      ),
    );
    const statuses = responses.map((response) => response.status());

    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(orders.length - 1);
  });

  for (const quantity of [-5, 0, 1_000_000]) {
    test(`an order with quantity ${quantity} is rejected`, async ({ request }) => {
      const user = await createUser(request);

      const response = await request.post('/api/v1/orders', {
        headers: bearer(user.token),
        data: { items: [{ sku: 'SKU-LAPTOP', quantity }] },
      });

      expect(response.status()).toBe(400);
    });
  }
});
