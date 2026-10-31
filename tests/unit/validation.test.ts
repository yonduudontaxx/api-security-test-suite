import { describe, expect, it } from 'vitest';
import {
  parseOrderItems,
  parsePagination,
  parsePartnerProfile,
  parseProfileUpdate,
  parseRegistration,
} from '../../src/validation.js';

describe('parsePagination', () => {
  it('applies defaults', () => {
    expect(parsePagination({})).toEqual({ limit: 20, offset: 0 });
  });

  it.each(['0', '-1', '101', '1.5', 'abc', '1e9'])('rejects limit=%s', (limit) => {
    expect(() => parsePagination({ limit })).toThrow('limit');
  });
});

describe('parseOrderItems', () => {
  it('prices items from the catalogue, never from the client', () => {
    expect(parseOrderItems({ items: [{ sku: 'SKU-PEN', quantity: 2, unitPriceCents: 1 }] }, true)).toEqual([
      { sku: 'SKU-PEN', quantity: 2, unitPriceCents: 250 },
    ]);
  });

  it.each([0, -1, 51, 1.5])('rejects quantity %s in strict mode', (quantity) => {
    expect(() => parseOrderItems({ items: [{ sku: 'SKU-PEN', quantity }] }, true)).toThrow('quantity');
  });

  it('caps the number of line items in strict mode', () => {
    const items = Array.from({ length: 21 }, () => ({ sku: 'SKU-PEN', quantity: 1 }));

    expect(() => parseOrderItems({ items }, true)).toThrow('At most');
  });

  it('rejects unknown skus', () => {
    expect(() => parseOrderItems({ items: [{ sku: 'SKU-FREE', quantity: 1 }] }, true)).toThrow('Unknown sku');
  });
});

describe('mass assignment guards', () => {
  it('rejects privileged fields on registration', () => {
    expect(() =>
      parseRegistration({ username: 'alice', email: 'a@example.test', password: 'long-enough-password', role: 'admin' }),
    ).toThrow('Unknown fields: role');
  });

  it('rejects privileged fields on profile update', () => {
    expect(() => parseProfileUpdate({ displayName: 'Alice', balanceCents: 10 })).toThrow('Unknown fields: balanceCents');
  });

  it('accepts allowed profile fields', () => {
    expect(parseProfileUpdate({ displayName: 'Alice Example' })).toEqual({ displayName: 'Alice Example' });
  });
});

describe('parsePartnerProfile', () => {
  const valid = { id: 'acme', name: 'Acme Logistics', website: 'https://acme.example.test', discountPercent: 5 };

  it('accepts a valid profile', () => {
    expect(parsePartnerProfile(valid)).toEqual(valid);
  });

  it.each([
    { name: '<img src=x onerror=alert(1)>' },
    { website: 'javascript:alert(1)' },
    { website: 'http://acme.example.test' },
    { discountPercent: 250 },
    { discountPercent: -1 },
    { role: 'admin' },
  ])('rejects tampered field %o', (override) => {
    expect(() => parsePartnerProfile({ ...valid, ...override })).toThrow();
  });
});
