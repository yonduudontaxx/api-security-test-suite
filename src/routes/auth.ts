import type { FastifyInstance } from 'fastify';
import { privateView, type AppContext } from '../context.js';
import { ApiError, badRequest } from '../errors.js';
import { signToken } from '../security/jwt.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import type { Role } from '../store.js';
import { asObject, parseLogin, parseRegistration } from '../validation.js';

const DUMMY_HASH = hashPassword('dummy-password-for-timing');

export function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): void {
  const { store, config, lockout, loginLimiter, hardened } = ctx;

  app.post('/auth/register', async (request, reply) => {
    if (hardened) {
      const input = parseRegistration(request.body);
      if (store.findUserByUsername(input.username)) throw new ApiError(409, 'username_taken', 'Username is not available');
      return reply.code(201).send(privateView(store.createUser(input)));
    }
    const body = asObject(request.body);
    const { username, email, password } = body;
    if (typeof username !== 'string' || typeof password !== 'string') throw badRequest('username and password are required');
    if (store.findUserByUsername(username)) throw new ApiError(409, 'username_taken', 'Username is not available');
    const user = store.createUser({ username, email: String(email ?? ''), password, role: body.role as Role | undefined });
    return reply.code(201).send(privateView(user));
  });

  app.post('/auth/login', async (request, reply) => {
    const { username, password } = parseLogin(request.body);
    const user = store.findUserByUsername(username);

    if (!hardened) {
      if (!user) throw new ApiError(404, 'user_not_found', `No account exists for "${username}"`);
      if (!verifyPassword(password, user.passwordHash)) throw new ApiError(401, 'wrong_password', 'Password is incorrect');
      return { token: signToken({ sub: user.id, role: user.role }, config.jwtSecret, config.tokenTtlSeconds) };
    }

    const throttle = loginLimiter.peek(request.ip);
    if (!throttle.allowed) {
      reply.header('retry-after', String(throttle.retryAfterSeconds));
      throw new ApiError(429, 'rate_limited', 'Too many failed login attempts, try again later');
    }
    const lockoutKey = `${request.ip}|${username}`;
    const lockedFor = lockout.retryAfterSeconds(lockoutKey);
    if (lockedFor > 0) {
      reply.header('retry-after', String(lockedFor));
      throw new ApiError(429, 'account_locked', 'Too many failed attempts, try again later');
    }
    const passwordMatches = verifyPassword(password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !passwordMatches) {
      lockout.recordFailure(lockoutKey);
      loginLimiter.hit(request.ip);
      throw new ApiError(401, 'invalid_credentials', 'Invalid username or password');
    }
    lockout.reset(lockoutKey);
    return { token: signToken({ sub: user.id, role: user.role }, config.jwtSecret, config.tokenTtlSeconds) };
  });
}
