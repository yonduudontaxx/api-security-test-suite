import { setTimeout as delay } from 'node:timers/promises';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { currentUser, type AppContext } from '../context.js';
import { ApiError, badRequest, notFound } from '../errors.js';
import { coupons, type Order } from '../store.js';
import { asObject, parseOrderItems, parsePagination } from '../validation.js';

const PRICING_SERVICE_LATENCY_MS = 25;

export function registerOrderRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { store, hardened } = ctx;

  function findOrder(request: FastifyRequest<{ Params: { orderId: string } }>): Order {
    const user = currentUser(request);
    const order = store.orders.get(request.params.orderId);
    if (!order) throw notFound('Order');
    if (hardened && order.ownerId !== user.id && user.role !== 'admin') throw notFound('Order');
    return order;
  }

  app.post('/orders', async (request, reply) => {
    const user = currentUser(request);
    const items = parseOrderItems(request.body, hardened);
    return reply.code(201).send(store.createOrder(user.id, items));
  });

  app.get<{ Querystring: Record<string, string> }>('/orders', async (request) => {
    const user = currentUser(request);
    const query = request.query;
    const { limit, offset } = hardened
      ? parsePagination(query)
      : { limit: Number(query.limit ?? 20), offset: Number(query.offset ?? 0) };
    const ownerId = hardened ? user.id : (query.ownerId ?? user.id);
    const owned = [...store.orders.values()].filter((order) => order.ownerId === ownerId);
    return { items: owned.slice(offset, offset + limit), total: owned.length, limit, offset };
  });

  app.get<{ Params: { orderId: string } }>('/orders/:orderId', async (request) => findOrder(request));

  app.delete<{ Params: { orderId: string } }>('/orders/:orderId', async (request) => {
    const order = findOrder(request);
    order.status = 'cancelled';
    return order;
  });

  app.post<{ Params: { orderId: string } }>('/orders/:orderId/coupon', async (request) => {
    const user = currentUser(request);
    const order = findOrder(request);
    const code = asObject(request.body).code;
    if (typeof code !== 'string') throw badRequest('code is required');
    const coupon = coupons.get(code);
    if (!coupon) throw notFound('Coupon');
    if (order.couponCode) throw new ApiError(409, 'coupon_already_applied', 'Order already has a coupon');

    const redemptionKey = `${hardened ? order.ownerId : user.id}:${code}`;
    if (store.redeemedCoupons.has(redemptionKey)) {
      throw new ApiError(409, 'coupon_already_redeemed', 'Coupon has already been redeemed');
    }
    if (hardened) store.redeemedCoupons.add(redemptionKey);
    await delay(PRICING_SERVICE_LATENCY_MS);
    if (!hardened) store.redeemedCoupons.add(redemptionKey);

    order.couponCode = code;
    order.discountCents = Math.round((order.subtotalCents * coupon.percentOff) / 100);
    order.totalCents = order.subtotalCents - order.discountCents;
    return order;
  });
}
