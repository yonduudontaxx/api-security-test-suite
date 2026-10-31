import type { FastifyInstance, FastifyRequest } from 'fastify';
import { currentUser, privateView, type AppContext } from '../context.js';
import { forbidden, notFound } from '../errors.js';

export function registerAdminRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { store, hardened } = ctx;

  function requireAdmin(request: FastifyRequest): void {
    const user = currentUser(request);
    if (hardened && user.role !== 'admin') throw forbidden();
  }

  app.get('/admin/users', async (request) => {
    requireAdmin(request);
    return { items: [...store.users.values()].map(privateView) };
  });

  app.delete<{ Params: { userId: string } }>('/admin/users/:userId', async (request, reply) => {
    requireAdmin(request);
    if (!store.users.delete(request.params.userId)) throw notFound('User');
    return reply.code(204).send();
  });
}

export function registerLegacyRoutes(app: FastifyInstance, ctx: AppContext): void {
  app.get('/api/v0/users', async () => ({ items: [...ctx.store.users.values()] }));
  app.get('/debug/config', async () => ctx.config);
}
