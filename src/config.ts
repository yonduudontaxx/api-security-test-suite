import { randomBytes } from 'node:crypto';

export type SecurityMode = 'vulnerable' | 'hardened';

export interface AppConfig {
  mode: SecurityMode;
  host: string;
  port: number;
  jwtSecret: string;
  tokenTtlSeconds: number;
  adminPassword: string;
  upstreamUrl: string;
  importAllowedOrigins: string[];
  corsAllowedOrigins: string[];
  rateLimitPerMinute: number;
  loginFailureLimitPerMinute: number;
  maxLoginFailures: number;
}

function parseMode(value: string | undefined): SecurityMode {
  if (value === undefined || value === 'hardened') return 'hardened';
  if (value === 'vulnerable') return 'vulnerable';
  throw new Error(`SECURITY_MODE must be "vulnerable" or "hardened", got "${value}"`);
}

function list(value: string | undefined, fallback: string[]): string[] {
  if (!value) return fallback;
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const upstreamUrl = env.UPSTREAM_URL ?? 'http://127.0.0.1:4010';
  return {
    mode: parseMode(env.SECURITY_MODE),
    host: '127.0.0.1',
    port: Number(env.PORT ?? 3000),
    jwtSecret: env.JWT_SECRET ?? randomBytes(32).toString('hex'),
    tokenTtlSeconds: 900,
    adminPassword: env.ADMIN_PASSWORD ?? randomBytes(12).toString('base64url'),
    upstreamUrl,
    importAllowedOrigins: list(env.IMPORT_ALLOWED_ORIGINS, [new URL(upstreamUrl).origin]),
    corsAllowedOrigins: list(env.CORS_ALLOWED_ORIGINS, ['https://app.example.test']),
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? 100),
    loginFailureLimitPerMinute: Number(env.LOGIN_FAILURE_LIMIT_PER_MINUTE ?? 20),
    maxLoginFailures: 5,
  };
}
