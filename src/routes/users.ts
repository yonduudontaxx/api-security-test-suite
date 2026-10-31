import type { FastifyInstance } from 'fastify';
import { currentUser, privateView, publicView, type AppContext } from '../context.js';
import { notFound } from '../errors.js';
import { asObject, parseProfileUpdate } from '../validation.js';

export function registerUserRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { store, hardened } = ctx;

  app.get('/users/me', async (request) => {
    const user = currentUser(request);
    return hardened ? privateView(user) : user;
  });

  app.patch('/users/me', async (request) => {
    const user = currentUser(request);
    if (hardened) {
      Object.assign(user, parseProfileUpdate(request.body));
      return privateView(user);
    }
    Object.assign(user, asObject(request.body));
    return user;
  });

  app.get<{ Params: { userId: string } }>('/users/:userId', async (request) => {
    currentUser(request);
    const user = store.users.get(request.params.userId);
    if (!user) throw notFound('User');
    return hardened ? publicView(user) : user;
  });
}
