import { randomBytes } from 'node:crypto';

process.env.SUITE_JWT_SECRET ??= randomBytes(32).toString('hex');
process.env.SUITE_ADMIN_PASSWORD ??= randomBytes(18).toString('base64url');

export const API_PORT = 3000;
export const UPSTREAM_PORT = 4010;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const UPSTREAM_URL = `http://127.0.0.1:${UPSTREAM_PORT}`;
export const JWT_SECRET = process.env.SUITE_JWT_SECRET;
export const ADMIN_PASSWORD = process.env.SUITE_ADMIN_PASSWORD;
export const ALLOWED_CORS_ORIGIN = 'https://app.example.test';

export const TEST_ENV = {
  PORT: String(API_PORT),
  JWT_SECRET,
  ADMIN_PASSWORD,
  UPSTREAM_URL,
  CORS_ALLOWED_ORIGINS: ALLOWED_CORS_ORIGIN,
};
