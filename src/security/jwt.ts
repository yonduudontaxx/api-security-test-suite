import { createHmac, timingSafeEqual } from 'node:crypto';
import type { SecurityMode } from '../config.js';

export interface TokenClaims {
  sub: string;
  role: 'user' | 'admin';
  iat: number;
  exp: number;
}

export class TokenError extends Error {}

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

function decodeSegment(segment: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'));
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new TokenError('Malformed token');
    return parsed as Record<string, unknown>;
  } catch {
    throw new TokenError('Malformed token');
  }
}

function hmac(input: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(input).digest();
}

export function signToken(
  claims: Pick<TokenClaims, 'sub' | 'role'>,
  secret: string,
  ttlSeconds: number,
  now = Math.floor(Date.now() / 1000),
): string {
  const header = encode({ alg: 'HS256', typ: 'JWT' });
  const payload = encode({ ...claims, iat: now, exp: now + ttlSeconds });
  const signature = hmac(`${header}.${payload}`, secret).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function toClaims(payload: Record<string, unknown>): TokenClaims {
  const { sub, role, iat, exp } = payload;
  if (typeof sub !== 'string' || (role !== 'user' && role !== 'admin')) throw new TokenError('Invalid claims');
  if (typeof iat !== 'number' || typeof exp !== 'number') throw new TokenError('Invalid claims');
  return { sub, role, iat, exp };
}

export function verifyToken(
  token: string,
  secret: string,
  mode: SecurityMode,
  now = Math.floor(Date.now() / 1000),
): TokenClaims {
  const parts = token.split('.');
  if (parts.length !== 3) throw new TokenError('Malformed token');
  const [headerSegment, payloadSegment, signatureSegment] = parts as [string, string, string];
  const header = decodeSegment(headerSegment);
  const payload = decodeSegment(payloadSegment);

  if (mode === 'vulnerable') {
    if (String(header.alg).toLowerCase() === 'none') return payload as unknown as TokenClaims;
    const expected = hmac(`${headerSegment}.${payloadSegment}`, secret).toString('base64url');
    if (expected !== signatureSegment) throw new TokenError('Invalid signature');
    return payload as unknown as TokenClaims;
  }

  if (header.alg !== 'HS256') throw new TokenError('Unsupported algorithm');
  const expected = hmac(`${headerSegment}.${payloadSegment}`, secret);
  const actual = Buffer.from(signatureSegment, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new TokenError('Invalid signature');
  }
  const claims = toClaims(payload);
  if (claims.exp <= now) throw new TokenError('Token expired');
  if (claims.iat > now + 60) throw new TokenError('Token issued in the future');
  return claims;
}
