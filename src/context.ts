import type { FastifyRequest } from 'fastify';
import type { AppConfig } from './config.js';
import { unauthorized } from './errors.js';
import type { FixedWindowLimiter, LoginLockout } from './security/throttle.js';
import type { Store, User } from './store.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: User | null;
  }
}

export interface AppContext {
  config: AppConfig;
  store: Store;
  limiter: FixedWindowLimiter;
  loginLimiter: FixedWindowLimiter;
  lockout: LoginLockout;
  hardened: boolean;
}

export function currentUser(request: FastifyRequest): User {
  if (!request.user) throw unauthorized();
  return request.user;
}

export function privateView(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    role: user.role,
    balanceCents: user.balanceCents,
    createdAt: user.createdAt,
  };
}

export function publicView(user: User) {
  return { id: user.id, username: user.username, displayName: user.displayName };
}
