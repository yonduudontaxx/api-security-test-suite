import type { AppConfig } from './config.js';

const json = (schema: object) => ({ content: { 'application/json': { schema } } });
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const error = (description: string) => ({ description, ...json(ref('Error')) });
const pathId = (name: string) => ({ name, in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });

const authErrors = {
  '401': error('Missing, invalid or expired token'),
  '429': error('Rate limit exceeded'),
};

export function buildOpenApiDocument(config: AppConfig) {
  return {
    openapi: '3.1.0',
    info: {
      title: 'Shop API (security test target)',
      version: '1.0.0',
      description: `Target API for the OWASP API Security Top 10 suite. Running in ${config.mode} mode.`,
      license: { name: 'MIT', identifier: 'MIT' },
    },
    servers: [{ url: `http://127.0.0.1:${config.port}` }],
    security: [{ bearerAuth: [] }],
    paths: {
      '/health': {
        get: {
          operationId: 'getHealth',
          security: [],
          responses: { '200': { description: 'Service is up', ...json(ref('Health')) } },
        },
      },
      '/openapi.json': {
        get: {
          operationId: 'getOpenApi',
          security: [],
          responses: { '200': { description: 'This document', ...json({ type: 'object' }) } },
        },
      },
      '/api/v1/auth/register': {
        post: {
          operationId: 'register',
          security: [],
          requestBody: { required: true, ...json(ref('Registration')) },
          responses: {
            '201': { description: 'Account created', ...json(ref('PrivateUser')) },
            '400': error('Invalid input'),
            '409': error('Username taken'),
          },
        },
      },
      '/api/v1/auth/login': {
        post: {
          operationId: 'login',
          security: [],
          requestBody: { required: true, ...json(ref('Credentials')) },
          responses: {
            '200': { description: 'Token issued', ...json(ref('Token')) },
            '400': error('Invalid input'),
            '401': error('Invalid username or password'),
            '429': error('Account temporarily locked'),
          },
        },
      },
      '/api/v1/users/me': {
        get: {
          operationId: 'getMe',
          responses: { '200': { description: 'Current user', ...json(ref('PrivateUser')) }, ...authErrors },
        },
        patch: {
          operationId: 'updateMe',
          requestBody: { required: true, ...json(ref('ProfileUpdate')) },
          responses: {
            '200': { description: 'Updated user', ...json(ref('PrivateUser')) },
            '400': error('Invalid input'),
            ...authErrors,
          },
        },
      },
      '/api/v1/users/{userId}': {
        get: {
          operationId: 'getUser',
          parameters: [pathId('userId')],
          responses: {
            '200': { description: 'Public profile', ...json(ref('PublicUser')) },
            '404': error('User not found'),
            ...authErrors,
          },
        },
      },
      '/api/v1/orders': {
        get: {
          operationId: 'listOrders',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
            { name: 'offset', in: 'query', schema: { type: 'integer', minimum: 0, maximum: 10000, default: 0 } },
          ],
          responses: {
            '200': { description: 'Orders owned by the caller', ...json(ref('OrderPage')) },
            '400': error('Invalid pagination'),
            ...authErrors,
          },
        },
        post: {
          operationId: 'createOrder',
          requestBody: { required: true, ...json(ref('NewOrder')) },
          responses: {
            '201': { description: 'Order created', ...json(ref('Order')) },
            '400': error('Invalid input'),
            '413': error('Payload too large'),
            ...authErrors,
          },
        },
      },
      '/api/v1/orders/{orderId}': {
        get: {
          operationId: 'getOrder',
          parameters: [pathId('orderId')],
          responses: { '200': { description: 'Order', ...json(ref('Order')) }, '404': error('Order not found'), ...authErrors },
        },
        delete: {
          operationId: 'cancelOrder',
          parameters: [pathId('orderId')],
          responses: {
            '200': { description: 'Cancelled order', ...json(ref('Order')) },
            '404': error('Order not found'),
            ...authErrors,
          },
        },
      },
      '/api/v1/orders/{orderId}/coupon': {
        post: {
          operationId: 'applyCoupon',
          parameters: [pathId('orderId')],
          requestBody: { required: true, ...json(ref('CouponRequest')) },
          responses: {
            '200': { description: 'Coupon applied', ...json(ref('Order')) },
            '404': error('Order or coupon not found'),
            '409': error('Coupon already redeemed or applied'),
            ...authErrors,
          },
        },
      },
      '/api/v1/files/import': {
        post: {
          operationId: 'importFile',
          requestBody: { required: true, ...json(ref('ImportRequest')) },
          responses: {
            '201': { description: 'File imported', ...json(ref('ImportedFile')) },
            '400': error('URL rejected'),
            '502': error('Upstream failed'),
            '504': error('Upstream timed out'),
            ...authErrors,
          },
        },
      },
      '/api/v1/partners/{partnerId}': {
        get: {
          operationId: 'getPartner',
          parameters: [{ name: 'partnerId', in: 'path', required: true, schema: { type: 'string', pattern: '^[a-z0-9-]{1,40}$' } }],
          responses: {
            '200': { description: 'Validated partner profile', ...json(ref('Partner')) },
            '400': error('Invalid partner id'),
            '404': error('Partner not found'),
            '502': error('Upstream returned invalid data'),
            '504': error('Upstream timed out'),
            ...authErrors,
          },
        },
      },
      '/api/v1/admin/users': {
        get: {
          operationId: 'adminListUsers',
          responses: {
            '200': { description: 'All users', ...json({ type: 'object', properties: { items: { type: 'array', items: ref('PrivateUser') } } }) },
            '403': error('Admin role required'),
            ...authErrors,
          },
        },
      },
      '/api/v1/admin/users/{userId}': {
        delete: {
          operationId: 'adminDeleteUser',
          parameters: [pathId('userId')],
          responses: {
            '204': { description: 'User deleted' },
            '403': error('Admin role required'),
            '404': error('User not found'),
            ...authErrors,
          },
        },
      },
    },
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
      schemas: {
        Error: {
          type: 'object',
          required: ['error', 'message'],
          properties: { error: { type: 'string' }, message: { type: 'string' } },
        },
        Health: { type: 'object', properties: { status: { type: 'string' }, mode: { type: 'string' } } },
        Registration: {
          type: 'object',
          additionalProperties: false,
          required: ['username', 'email', 'password'],
          properties: {
            username: { type: 'string', pattern: '^[a-zA-Z0-9_-]{3,40}$' },
            email: { type: 'string', format: 'email', maxLength: 254 },
            password: { type: 'string', minLength: 12, maxLength: 128 },
          },
        },
        Credentials: {
          type: 'object',
          required: ['username', 'password'],
          properties: { username: { type: 'string', maxLength: 64 }, password: { type: 'string', maxLength: 128 } },
        },
        Token: { type: 'object', properties: { token: { type: 'string' } } },
        ProfileUpdate: {
          type: 'object',
          additionalProperties: false,
          properties: { email: { type: 'string', format: 'email' }, displayName: { type: 'string', maxLength: 60 } },
        },
        PublicUser: {
          type: 'object',
          properties: { id: { type: 'string' }, username: { type: 'string' }, displayName: { type: 'string' } },
        },
        PrivateUser: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            username: { type: 'string' },
            email: { type: 'string' },
            displayName: { type: 'string' },
            role: { type: 'string', enum: ['user', 'admin'] },
            balanceCents: { type: 'integer' },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        NewOrder: {
          type: 'object',
          required: ['items'],
          properties: {
            items: {
              type: 'array',
              minItems: 1,
              maxItems: 20,
              items: {
                type: 'object',
                required: ['sku', 'quantity'],
                properties: {
                  sku: { type: 'string', enum: ['SKU-BOOK', 'SKU-PEN', 'SKU-LAPTOP'] },
                  quantity: { type: 'integer', minimum: 1, maximum: 50 },
                },
              },
            },
          },
        },
        Order: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            ownerId: { type: 'string' },
            items: { type: 'array', items: { type: 'object' } },
            subtotalCents: { type: 'integer' },
            discountCents: { type: 'integer' },
            totalCents: { type: 'integer' },
            couponCode: { type: ['string', 'null'] },
            status: { type: 'string', enum: ['open', 'cancelled'] },
            createdAt: { type: 'string', format: 'date-time' },
          },
        },
        OrderPage: {
          type: 'object',
          properties: {
            items: { type: 'array', items: ref('Order') },
            total: { type: 'integer' },
            limit: { type: 'integer' },
            offset: { type: 'integer' },
          },
        },
        CouponRequest: { type: 'object', required: ['code'], properties: { code: { type: 'string' } } },
        ImportRequest: { type: 'object', required: ['url'], properties: { url: { type: 'string', format: 'uri', maxLength: 2048 } } },
        ImportedFile: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            ownerId: { type: 'string' },
            sourceUrl: { type: 'string' },
            contentType: { type: 'string' },
            sizeBytes: { type: 'integer' },
            preview: { type: 'string' },
          },
        },
        Partner: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            website: { type: 'string', format: 'uri' },
            discountPercent: { type: 'integer', minimum: 0, maximum: 50 },
          },
        },
      },
    },
  };
}
