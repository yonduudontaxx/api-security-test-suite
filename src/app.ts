import Fastify, { type FastifyError, type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import type { AppConfig } from './config.js';
import type { AppContext } from './context.js';
import { ApiError, unauthorized } from './errors.js';
import { buildOpenApiDocument } from './openapi.js';
import { registerAdminRoutes, registerLegacyRoutes } from './routes/admin.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerIntegrationRoutes } from './routes/integrations.js';
import { registerOrderRoutes } from './routes/orders.js';
import { registerUserRoutes } from './routes/users.js';
import { TokenError, verifyToken } from './security/jwt.js';
import { FixedWindowLimiter, LoginLockout } from './security/throttle.js';
import { Store } from './store.js';

const HARDENED_HEADERS: Record<string, string> = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'cross-origin-resource-policy': 'same-origin',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
};

const GENERIC_CLIENT_ERRORS: Record<number, [string, string]> = {
  400: ['bad_request', 'Malformed request'],
  404: ['not_found', 'Resource not found'],
  405: ['method_not_allowed', 'Method not allowed'],
  413: ['payload_too_large', 'Request body is too large'],
  415: ['unsupported_media_type', 'Unsupported content type'],
};

function applyCors(ctx: AppContext, request: FastifyRequest, reply: FastifyReply): void {
  const origin = request.headers.origin;
  if (!origin) return;
  if (!ctx.hardened) {
    reply.header('access-control-allow-origin', origin);
    reply.header('access-control-allow-credentials', 'true');
    return;
  }
  reply.header('vary', 'Origin');
  if (!ctx.config.corsAllowedOrigins.includes(origin)) return;
  reply.header('access-control-allow-origin', origin);
  reply.header('access-control-allow-methods', 'GET, POST, PATCH, DELETE');
  reply.header('access-control-allow-headers', 'authorization, content-type');
  reply.header('access-control-max-age', '600');
}

function authenticate(ctx: AppContext) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw unauthorized();
    let subject: string;
    try {
      subject = verifyToken(header.slice('Bearer '.length), ctx.config.jwtSecret, ctx.config.mode).sub;
    } catch (error) {
      if (error instanceof TokenError) throw unauthorized('Invalid or expired token');
      throw error;
    }
    const user = ctx.store.users.get(subject);
    if (!user) throw unauthorized('Invalid or expired token');
    request.user = user;

    if (!ctx.hardened) return;
    const decision = ctx.limiter.hit(user.id);
    if (!decision.allowed) {
      reply.header('retry-after', String(decision.retryAfterSeconds));
      throw new ApiError(429, 'rate_limited', 'Rate limit exceeded');
    }
  };
}

function errorHandler(ctx: AppContext) {
  return (error: FastifyError | ApiError, request: FastifyRequest, reply: FastifyReply) => {
    const status = error.statusCode ?? 500;
    if (!ctx.hardened) {
      return reply.code(status).send({ error: error.code ?? 'error', message: error.message, stack: error.stack });
    }
    if (error instanceof ApiError) return reply.code(status).send({ error: error.code, message: error.message });
    if (status < 500) {
      const [code, message] = GENERIC_CLIENT_ERRORS[status] ?? ['bad_request', 'Malformed request'];
      return reply.code(status).send({ error: code, message });
    }
    request.log.error(error);
    return reply.code(500).send({ error: 'internal_error', message: 'Internal server error' });
  };
}

export function buildApp(config: AppConfig): FastifyInstance {
  const hardened = config.mode === 'hardened';
  const ctx: AppContext = {
    config,
    store: new Store(),
    limiter: new FixedWindowLimiter(config.rateLimitPerMinute, 60_000),
    lockout: new LoginLockout(config.maxLoginFailures, 15 * 60_000),
    hardened,
  };
  ctx.store.createUser({ username: 'admin', email: 'admin@example.test', password: config.adminPassword, role: 'admin' });

  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL ?? 'warn' },
    bodyLimit: hardened ? 16 * 1024 : 10 * 1024 * 1024,
  });
  app.decorateRequest('user', null);
  app.setErrorHandler(errorHandler(ctx));
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not_found', message: 'Resource not found' }));

  app.addHook('onRequest', async (request, reply) => applyCors(ctx, request, reply));
  app.addHook('onSend', async (_request, reply, payload) => {
    if (hardened) reply.headers(HARDENED_HEADERS);
    else reply.headers({ 'x-powered-by': 'Fastify/5', server: `node/${process.version}` });
    return payload;
  });

  app.options('*', async (_request, reply) => reply.code(204).send());
  app.get('/health', async () => ({ status: 'ok', mode: config.mode }));
  app.get('/openapi.json', async () => buildOpenApiDocument(config));

  app.register(
    async (api) => {
      registerAuthRoutes(api, ctx);
      api.register(async (secured) => {
        secured.addHook('onRequest', authenticate(ctx));
        registerUserRoutes(secured, ctx);
        registerOrderRoutes(secured, ctx);
        registerIntegrationRoutes(secured, ctx);
        registerAdminRoutes(secured, ctx);
      });
    },
    { prefix: '/api/v1' },
  );

  if (!hardened) registerLegacyRoutes(app, ctx);
  return app;
}
