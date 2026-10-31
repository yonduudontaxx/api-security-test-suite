import { badRequest } from './errors.js';
import { catalog, type OrderItem } from './store.js';

type Body = Record<string, unknown>;

export const MAX_PAGE_SIZE = 100;
export const MAX_ORDER_ITEMS = 20;
export const MAX_ITEM_QUANTITY = 50;

export function asObject(value: unknown): Body {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw badRequest('Body must be a JSON object');
  return value as Body;
}

function requireString(body: Body, field: string, pattern: RegExp, maxLength: number): string {
  const value = body[field];
  if (typeof value !== 'string' || value.length > maxLength || !pattern.test(value)) {
    throw badRequest(`Field "${field}" is invalid`);
  }
  return value;
}

function rejectUnknownFields(body: Body, allowed: readonly string[]): void {
  const unknown = Object.keys(body).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw badRequest(`Unknown fields: ${unknown.join(', ')}`);
}

export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,40}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PASSWORD_PATTERN = /^.{12,128}$/;
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} ._-]{1,60}$/u;

export function parseRegistration(input: unknown) {
  const body = asObject(input);
  rejectUnknownFields(body, ['username', 'email', 'password']);
  return {
    username: requireString(body, 'username', USERNAME_PATTERN, 40),
    email: requireString(body, 'email', EMAIL_PATTERN, 254),
    password: requireString(body, 'password', PASSWORD_PATTERN, 128),
  };
}

export function parseLogin(input: unknown) {
  const body = asObject(input);
  return {
    username: requireString(body, 'username', /^.{1,64}$/, 64),
    password: requireString(body, 'password', /^.{1,128}$/, 128),
  };
}

export function parseProfileUpdate(input: unknown): { email?: string; displayName?: string } {
  const body = asObject(input);
  rejectUnknownFields(body, ['email', 'displayName']);
  const update: { email?: string; displayName?: string } = {};
  if (body.email !== undefined) update.email = requireString(body, 'email', EMAIL_PATTERN, 254);
  if (body.displayName !== undefined) update.displayName = requireString(body, 'displayName', DISPLAY_NAME_PATTERN, 60);
  return update;
}

export function parsePagination(query: Body): { limit: number; offset: number } {
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  const offset = query.offset === undefined ? 0 : Number(query.offset);
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw badRequest(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
  if (!Number.isInteger(offset) || offset < 0 || offset > 10_000) throw badRequest('offset is out of range');
  return { limit, offset };
}

export function parseOrderItems(input: unknown, strict: boolean): OrderItem[] {
  const body = asObject(input);
  const items = body.items;
  if (!Array.isArray(items) || items.length === 0) throw badRequest('items must be a non-empty array');
  if (strict && items.length > MAX_ORDER_ITEMS) throw badRequest(`At most ${MAX_ORDER_ITEMS} items per order`);
  return items.map((raw) => {
    const item = asObject(raw);
    const sku = item.sku;
    const quantity = item.quantity;
    if (typeof sku !== 'string' || !(sku in catalog)) throw badRequest('Unknown sku');
    if (typeof quantity !== 'number' || !Number.isInteger(quantity)) throw badRequest('quantity must be an integer');
    if (strict && (quantity < 1 || quantity > MAX_ITEM_QUANTITY)) {
      throw badRequest(`quantity must be between 1 and ${MAX_ITEM_QUANTITY}`);
    }
    return { sku, quantity, unitPriceCents: catalog[sku] ?? 0 };
  });
}

export interface PartnerProfile {
  id: string;
  name: string;
  website: string;
  discountPercent: number;
}

const PARTNER_NAME_PATTERN = /^[\p{L}\p{N} .,&'-]{1,80}$/u;

export function parsePartnerProfile(input: unknown): PartnerProfile {
  const body = asObject(input);
  rejectUnknownFields(body, ['id', 'name', 'website', 'discountPercent']);
  const id = requireString(body, 'id', /^[a-z0-9-]{1,40}$/, 40);
  const name = requireString(body, 'name', PARTNER_NAME_PATTERN, 80);
  const website = requireString(body, 'website', /^https:\/\/[^\s<>"']+$/, 200);
  const discountPercent = body.discountPercent;
  if (typeof discountPercent !== 'number' || !Number.isInteger(discountPercent) || discountPercent < 0 || discountPercent > 50) {
    throw badRequest('discountPercent is out of range');
  }
  return { id, name, website, discountPercent };
}
