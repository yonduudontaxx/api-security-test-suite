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
  accountFailureLimitPerHour: number;
  registrationLimitPerHour: number;
  trustedAddressTtlDays: number;
  maxLoginFailures: number;
}

function parseMode(value: string | undefined): SecurityMode {
  if (value === undefined || value === 'hardened') return 'hardened';
  if (value === 'vulnerable') return 'vulnerable';
  throw new Error(`SECURITY_MODE must be "vulnerable" or "hardened", got "${value}"`);
}

function jwtSecret(value: string | undefined): string {
  if (value === undefined) return randomBytes(32).toString('hex');
  if (value.length < 32) throw new Error('JWT_SECRET must be at least 32 characters');
  return value;
}

function positiveInteger(name: string, value: string | undefined, fallback: number, max = Number.MAX_SAFE_INTEGER): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer, got "${value}"`);
  }
  if (parsed > max) throw new Error(`${name} must be at most ${max}, got "${value}"`);
  return parsed;
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
    jwtSecret: jwtSecret(env.JWT_SECRET),
    tokenTtlSeconds: 900,
    adminPassword: env.ADMIN_PASSWORD ?? randomBytes(12).toString('base64url'),
    upstreamUrl,
    importAllowedOrigins: list(env.IMPORT_ALLOWED_ORIGINS, [new URL(upstreamUrl).origin]),
    corsAllowedOrigins: list(env.CORS_ALLOWED_ORIGINS, ['https://app.example.test']),
    rateLimitPerMinute: positiveInteger('RATE_LIMIT_PER_MINUTE', env.RATE_LIMIT_PER_MINUTE, 100),
    loginFailureLimitPerMinute: positiveInteger('LOGIN_FAILURE_LIMIT_PER_MINUTE', env.LOGIN_FAILURE_LIMIT_PER_MINUTE, 20),
    accountFailureLimitPerHour: positiveInteger('ACCOUNT_FAILURE_LIMIT_PER_HOUR', env.ACCOUNT_FAILURE_LIMIT_PER_HOUR, 50),
    registrationLimitPerHour: positiveInteger('REGISTRATION_LIMIT_PER_HOUR', env.REGISTRATION_LIMIT_PER_HOUR, 20),
    trustedAddressTtlDays: positiveInteger('TRUSTED_ADDRESS_TTL_DAYS', env.TRUSTED_ADDRESS_TTL_DAYS, 30, 365),
    maxLoginFailures: 5,
  };
}
