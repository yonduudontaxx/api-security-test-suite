import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEY_LENGTH);
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, saltText, keyText] = stored.split('$');
  if (scheme !== 'scrypt' || !saltText || !keyText) return false;
  const expected = Buffer.from(keyText, 'base64url');
  const actual = scryptSync(password, Buffer.from(saltText, 'base64url'), expected.length);
  return timingSafeEqual(actual, expected);
}
