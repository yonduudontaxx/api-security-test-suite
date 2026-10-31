import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { signToken, TokenError, verifyToken } from '../../src/security/jwt.js';

const SECRET = 'unit-test-key';
const NOW = 1_800_000_000;

const segment = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
const sign = (unsigned: string, secret = SECRET) => createHmac('sha256', secret).update(unsigned).digest('base64url');

describe('verifyToken (hardened)', () => {
  it('accepts a token it signed', () => {
    const token = signToken({ sub: 'u1', role: 'user' }, SECRET, 60, NOW);

    expect(verifyToken(token, SECRET, 'hardened', NOW)).toMatchObject({ sub: 'u1', role: 'user', exp: NOW + 60 });
  });

  it('rejects alg=none', () => {
    const token = `${segment({ alg: 'none' })}.${segment({ sub: 'u1', role: 'admin', iat: NOW, exp: NOW + 60 })}.`;

    expect(() => verifyToken(token, SECRET, 'hardened', NOW)).toThrow(TokenError);
  });

  it('rejects other HMAC algorithms', () => {
    const unsigned = `${segment({ alg: 'HS512' })}.${segment({ sub: 'u1', role: 'user', iat: NOW, exp: NOW + 60 })}`;

    expect(() => verifyToken(`${unsigned}.${sign(unsigned)}`, SECRET, 'hardened', NOW)).toThrow('Unsupported algorithm');
  });

  it('rejects a signature made with another key', () => {
    const unsigned = `${segment({ alg: 'HS256' })}.${segment({ sub: 'u1', role: 'user', iat: NOW, exp: NOW + 60 })}`;

    expect(() => verifyToken(`${unsigned}.${sign(unsigned, 'other')}`, SECRET, 'hardened', NOW)).toThrow('Invalid signature');
  });

  it('rejects an expired token', () => {
    const token = signToken({ sub: 'u1', role: 'user' }, SECRET, 60, NOW - 120);

    expect(() => verifyToken(token, SECRET, 'hardened', NOW)).toThrow('Token expired');
  });

  it('rejects a token issued in the future', () => {
    const token = signToken({ sub: 'u1', role: 'user' }, SECRET, 600, NOW + 300);

    expect(() => verifyToken(token, SECRET, 'hardened', NOW)).toThrow('issued in the future');
  });

  it('rejects unknown roles', () => {
    const unsigned = `${segment({ alg: 'HS256' })}.${segment({ sub: 'u1', role: 'root', iat: NOW, exp: NOW + 60 })}`;

    expect(() => verifyToken(`${unsigned}.${sign(unsigned)}`, SECRET, 'hardened', NOW)).toThrow('Invalid claims');
  });

  it.each(['', 'a.b', 'not-base64.###.sig', `${segment({ alg: 'HS256' })}.bnVsbA.sig`])('rejects malformed token %j', (token) => {
    expect(() => verifyToken(token, SECRET, 'hardened', NOW)).toThrow(TokenError);
  });
});

describe('verifyToken (vulnerable)', () => {
  it('accepts alg=none, which the API2 suite must detect', () => {
    const token = `${segment({ alg: 'none' })}.${segment({ sub: 'u1', role: 'admin', iat: NOW, exp: NOW - 1 })}.`;

    expect(verifyToken(token, SECRET, 'vulnerable', NOW)).toMatchObject({ role: 'admin' });
  });
});
