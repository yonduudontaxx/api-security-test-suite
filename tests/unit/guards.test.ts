import { describe, expect, it } from 'vitest';
import { ApiError } from '../../src/errors.js';
import { hashPassword, verifyPassword } from '../../src/security/password.js';
import { FixedWindowLimiter, LoginLockout } from '../../src/security/throttle.js';
import { assertOutboundUrlAllowed } from '../../src/security/url-guard.js';

const ALLOWED = ['https://files.example.test'];

describe('assertOutboundUrlAllowed', () => {
  it('returns the parsed URL for an allowlisted origin', () => {
    expect(assertOutboundUrlAllowed('https://files.example.test/a.txt', ALLOWED).pathname).toBe('/a.txt');
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://127.0.0.1/',
    'http://localhost/',
    'http://[::1]/',
    'http://2130706433/',
    'http://files.example.test/a.txt',
    'https://files.example.test.evil.example/',
    'https://user:pass@files.example.test/',
    'file:///etc/passwd',
    'gopher://files.example.test/',
    'not a url',
  ])('rejects %s', (url) => {
    expect(() => assertOutboundUrlAllowed(url, ALLOWED)).toThrow(ApiError);
  });
});

describe('password hashing', () => {
  it('verifies the original password and rejects others', () => {
    const stored = hashPassword('correct horse battery staple');

    expect(verifyPassword('correct horse battery staple', stored)).toBe(true);
    expect(verifyPassword('Correct horse battery staple', stored)).toBe(false);
  });

  it('salts each hash', () => {
    expect(hashPassword('same-password')).not.toBe(hashPassword('same-password'));
  });

  it('rejects malformed stored hashes', () => {
    expect(verifyPassword('x', 'plaintext')).toBe(false);
  });
});

describe('FixedWindowLimiter', () => {
  it('allows up to the limit then blocks until the window resets', () => {
    const limiter = new FixedWindowLimiter(2, 1000);

    expect(limiter.hit('k', 0).allowed).toBe(true);
    expect(limiter.hit('k', 1).allowed).toBe(true);
    expect(limiter.hit('k', 2)).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.hit('k', 1000).allowed).toBe(true);
  });

  it('tracks keys independently', () => {
    const limiter = new FixedWindowLimiter(1, 1000);
    limiter.hit('a', 0);

    expect(limiter.hit('b', 0).allowed).toBe(true);
  });
});

describe('LoginLockout', () => {
  it('locks after the maximum failures and unlocks after the lock period', () => {
    const lockout = new LoginLockout(3, 60_000);
    for (let i = 0; i < 3; i += 1) lockout.recordFailure('alice', 0);

    expect(lockout.retryAfterSeconds('alice', 1)).toBe(60);
    expect(lockout.retryAfterSeconds('alice', 60_000)).toBe(0);
  });

  it('reset clears failures', () => {
    const lockout = new LoginLockout(2, 60_000);
    lockout.recordFailure('bob', 0);
    lockout.reset('bob');
    lockout.recordFailure('bob', 0);

    expect(lockout.retryAfterSeconds('bob', 1)).toBe(0);
  });
});
