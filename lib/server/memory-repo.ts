/**
 * In-memory repository used by unit tests and local demo without Postgres.
 * Production paths use Drizzle via db/client.ts.
 */
import type { MemoryStore } from "@/db/memory";
import { createMemoryStore } from "@/db/memory";
import type { CartItemInput, PricedCart } from "@/lib/server/cart";
import { priceCart } from "@/lib/server/cart";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { slugify, isValidSlug } from "@/lib/slug";
import { assertPositiveKobo } from "@/lib/money";

let store: MemoryStore = createMemoryStore();

/** Serializes concurrent confirm attempts per payment reference (test/sim). */
const confirmLocks = new Map<string, Promise<unknown>>();

export function resetMemoryStore(): void {
  store = createMemoryStore();
}

export function getMemoryStore(): MemoryStore {
  return store;
}

export async function memSignup(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  const email = input.email.toLowerCase().trim();
  if (store.users.some((u) => u.email === email)) {
    throw new Error("Email already registered");
  }
  const user = {
    id: store.seq.user++,
    email,
    passwordHash: await hashPassword(input.password),
    fullName: input.fullName.trim(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.users.push(user);
  return { id: user.id, email: user.email, fullName: user.fullName };
}

export async function memLogin(email: string, password: string) {
  const user = store.users.find((u) => u.email === email.toLowerCase().trim());
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  return { id: user.id, email: user.email, fullName: user.fullName };
}

export function memCreateStore(input: {
  ownerId: number;
  name: string;
  slug?: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
}) {
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);
  if (!isValidSlug(slug)) throw new Error("Invalid store slug");
  if (store.stores.some((s) => s.slug === slug)) {
    throw new Error("Store slug already taken");
  }
  const row = {
    id: store.seq.store++,
    ownerId: input.ownerId,
    name: input.name.trim(),
    slug,
    description: input.description?.trim() || "",
    logoUrl: null as string | null,
    bannerUrl: null as string | null,
    instagramUrl: null as string | null,
    facebookUrl: null as string | null,
    twitterUrl: null as string | null,
    tiktokUrl: null as string | null,
    phone: input.phone || null,
    whatsapp: input.whatsapp || null,
    email: input.email || null,
    address: input.address || null,
    currency: "NGN" as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.stores.push(row as (typeof store.stores)[0]);
  return row;
}

export function memGetStoreBySlug(slug: string) {
  return store.stores.find((s) => s.slug === slug) ?? null;
}

export function memGetStoreForOwner(storeId: number, ownerId: number) {
  const s = store.stores.find((x) => x.id === storeId);
  if (!s) throw new Error("Store not found");
  if (s.ownerId !== ownerId) throw new Error("Forbidden");
  return s;
}

export function memCreateProduct(input: {
  ownerId: number;
  storeId: number;
  name: string;
  description?: string;
  priceKobo: number;
  stock: number;
  category?: string;
  imageUrl?: string;
}) {
  memGetStoreForOwner(input.storeId, input.ownerId);
  assertPositiveKobo(input.priceKobo);
  if (!Number.isSafeInteger(input.stock) || input.stock < 0) {
    throw new Error("Invalid stock");
  }
  let slug = slugify(input.name);
  const base = slug;
  let n = 1;
  while (
    store.products.some((p) => p.storeId === input.storeId && p.slug === slug)
  ) {
    slug = `${base}-${n++}`;
  }
  const row = {
    id: store.seq.product++,
    storeId: input.storeId,
    name: input.name.trim(),
    slug,
    description: input.description?.trim() || "",
    priceKobo: input.priceKobo,
    imageUrl: input.imageUrl || null,
    stock: input.stock,
    category: input.category || "General",
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.products.push(row as (typeof store.products)[0]);
  return row;
}

export function memListProducts(storeId: number, activeOnly = false) {
  return store.products.filter(
    (p) => p.storeId === storeId && (!activeOnly || p.active)
  );
}

export function memPriceCart(
  storeId: number,
  items: CartItemInput[]
): PricedCart {
  const products = store.products.filter((p) => p.storeId === storeId);
  return priceCart(items, products);
}

export function memCreatePendingOrder(input: {
  storeId: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  note?: string;
  items: CartItemInput[];
  paymentReference: string;
}) {
  const cart = memPriceCart(input.storeId, input.items);
  const order = {
    id: store.seq.order++,
    storeId: input.storeId,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    customerEmail: input.customerEmail.toLowerCase().trim(),
    deliveryAddress: input.deliveryAddress.trim(),
    note: input.note?.trim() || "",
    subtotalKobo: cart.subtotalKobo,
    totalKobo: cart.totalKobo,
    currency: "NGN",
    paymentStatus: "pending",
    orderStatus: "pending",
    paymentReference: input.paymentReference,
    paystackAccessCode: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.orders.push(order as (typeof store.orders)[0]);

  for (const line of cart.lines) {
    store.orderItems.push({
      id: store.seq.item++,
      orderId: order.id,
      productId: line.productId,
      productNameSnapshot: line.name,
      unitPriceKoboSnapshot: line.unitPriceKobo,
      quantity: line.quantity,
      lineTotalKobo: line.lineTotalKobo,
    } as (typeof store.orderItems)[0]);
  }

  store.payments.push({
    id: store.seq.payment++,
    orderId: order.id,
    reference: input.paymentReference,
    amountKobo: cart.totalKobo,
    currency: "NGN",
    status: "pending",
    provider: "paystack",
    rawEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as (typeof store.payments)[0]);

  return { order, cart };
}

/** Idempotent: marks paid once, decrements stock once. */
export function memConfirmPaidOrder(reference: string, amountKobo: number) {
  const order = store.orders.find((o) => o.paymentReference === reference);
  if (!order) throw new Error("Order not found");

  if (order.paymentStatus === "paid") {
    return { order, alreadyPaid: true as const };
  }

  if (order.paymentStatus === "failed") {
    throw new Error("Cannot confirm a failed payment");
  }

  if (amountKobo !== order.totalKobo) {
    throw new Error("Payment amount mismatch");
  }

  // Claim pending → paid before stock moves (lost races become alreadyPaid)
  if (order.paymentStatus !== "pending") {
    return { order, alreadyPaid: true as const };
  }
  order.paymentStatus = "paid";
  order.orderStatus = "confirmed";
  order.updatedAt = new Date();

  const items = store.orderItems.filter((i) => i.orderId === order.id);
  for (const item of items) {
    const product = store.products.find((p) => p.id === item.productId);
    if (!product) continue;
    if (product.stock < item.quantity) {
      // roll back claim
      order.paymentStatus = "pending";
      order.orderStatus = "pending";
      throw new Error("Insufficient stock at payment confirmation");
    }
    product.stock -= item.quantity;
    product.updatedAt = new Date();
  }

  const payment = store.payments.find((p) => p.reference === reference);
  if (payment) {
    payment.status = "paid";
    payment.updatedAt = new Date();
  }

  return { order, alreadyPaid: false as const };
}

export function memListOrdersForOwner(ownerId: number) {
  const storeIds = new Set(
    store.stores.filter((s) => s.ownerId === ownerId).map((s) => s.id)
  );
  return store.orders
    .filter((o) => storeIds.has(o.storeId))
    .sort((a, b) => b.id - a.id);
}

export function memDashboardStats(ownerId: number) {
  const storeIds = new Set(
    store.stores.filter((s) => s.ownerId === ownerId).map((s) => s.id)
  );
  const orders = store.orders.filter((o) => storeIds.has(o.storeId));
  const paid = orders.filter((o) => o.paymentStatus === "paid");
  const salesKobo = paid.reduce((s, o) => s + o.totalKobo, 0);
  const products = store.products.filter((p) => storeIds.has(p.storeId));
  const customers = new Set(
    paid.map((o) => o.customerEmail.toLowerCase())
  ).size;
  return {
    salesKobo,
    orderCount: orders.length,
    productCount: products.length,
    customerCount: customers,
    recentOrders: orders.slice(0, 10),
  };
}


export function memMarkOrderPaymentFailed(reference: string, reason?: string) {
  const order = store.orders.find((o) => o.paymentReference === reference);
  if (!order) throw new Error("Order not found");
  if (order.paymentStatus === "paid") {
    throw new Error("Cannot fail a paid order");
  }
  order.paymentStatus = "failed";
  order.updatedAt = new Date();
  const payment = store.payments.find((p) => p.reference === reference);
  if (payment && payment.status !== "paid") {
    payment.status = "failed";
    payment.updatedAt = new Date();
  }
  return order;
}

/**
 * Idempotent webhook processing using rawEventId + per-reference serialization.
 * Concurrent callers for the same reference run one-at-a-time so stock moves once.
 */
export async function memConfirmPaidOrderWithEvent(
  reference: string,
  amountKobo: number,
  rawEventId?: string | null
): Promise<{ order: (typeof store.orders)[0]; alreadyPaid: boolean }> {
  const run = async () => {
    if (rawEventId) {
      const existing = store.payments.find((p) => p.rawEventId === rawEventId);
      if (existing) {
        const order = store.orders.find((o) => o.id === existing.orderId)!;
        return { order, alreadyPaid: true as const };
      }
    }
    const result = memConfirmPaidOrder(reference, amountKobo);
    if (rawEventId) {
      const payment = store.payments.find((p) => p.reference === reference);
      if (payment) payment.rawEventId = rawEventId;
    }
    return result;
  };

  const prev = confirmLocks.get(reference) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const chain = prev.then(() => gate);
  confirmLocks.set(reference, chain);
  await prev;
  try {
    return await run();
  } finally {
    release();
    if (confirmLocks.get(reference) === chain) {
      confirmLocks.delete(reference);
    }
  }
}
