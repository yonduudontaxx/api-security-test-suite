import { randomBytes, randomUUID } from 'node:crypto';
import { hashPassword } from './security/password.js';

export type Role = 'user' | 'admin';

export interface User {
  id: string;
  username: string;
  email: string;
  displayName: string;
  role: Role;
  balanceCents: number;
  passwordHash: string;
  resetToken: string;
  mfaSecret: string;
  createdAt: string;
}

export interface OrderItem {
  sku: string;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: string;
  ownerId: string;
  items: OrderItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  couponCode: string | null;
  status: 'open' | 'cancelled';
  createdAt: string;
}

export interface ImportedFile {
  id: string;
  ownerId: string;
  sourceUrl: string;
  contentType: string;
  sizeBytes: number;
  content: string;
}

export const catalog: Readonly<Record<string, number>> = {
  'SKU-BOOK': 1500,
  'SKU-PEN': 250,
  'SKU-LAPTOP': 129900,
};

export const coupons: Readonly<Record<string, { percentOff: number }>> = {
  WELCOME10: { percentOff: 10 },
};

export class Store {
  readonly users = new Map<string, User>();
  readonly orders = new Map<string, Order>();
  readonly files = new Map<string, ImportedFile>();
  readonly redeemedCoupons = new Set<string>();

  createUser(input: { username: string; email: string; password: string; role?: Role }): User {
    const user: User = {
      id: randomUUID(),
      username: input.username,
      email: input.email,
      displayName: input.username,
      role: input.role ?? 'user',
      balanceCents: 0,
      passwordHash: hashPassword(input.password),
      resetToken: randomBytes(16).toString('hex'),
      mfaSecret: randomBytes(10).toString('hex'),
      createdAt: new Date().toISOString(),
    };
    this.users.set(user.id, user);
    return user;
  }

  findUserByUsername(username: string): User | undefined {
    for (const user of this.users.values()) if (user.username === username) return user;
    return undefined;
  }

  createOrder(ownerId: string, items: OrderItem[]): Order {
    const subtotalCents = items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    const order: Order = {
      id: randomUUID(),
      ownerId,
      items,
      subtotalCents,
      discountCents: 0,
      totalCents: subtotalCents,
      couponCode: null,
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    this.orders.set(order.id, order);
    return order;
  }
}
