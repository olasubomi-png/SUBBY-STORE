/**
 * In-memory repository used by unit tests and local demo without Postgres.
 * Production paths use Drizzle via db/client.ts.
 */
import type { MemoryStore } from "@/db/memory";
import { createMemoryStore } from "@/db/memory";
import type { CartItemInput, PricedCart } from "@/lib/server/cart";
import { priceCart } from "@/lib/server/cart";
import {
  reservationExpiryDate,
  isReservationExpired,
} from "@/lib/server/reservations";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { slugify, isValidSlug } from "@/lib/slug";
import { assertPositiveKobo, ngnMajorToKobo } from "@/lib/money";
import { computeSellerAnalyticsFromData } from "@/lib/analytics-math";
import {
  computeDiscount,
  normalizeCouponCode,
  type CouponType,
} from "@/lib/coupons/math";
import {
  assertCouponValue,
  assertCouponDates,
  assertOptionalPositiveInt,
} from "@/lib/coupons/validate";

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
    seoTitle: null as string | null,
    seoDescription: null as string | null,
    seoKeywords: null as string | null,
    ogTitle: null as string | null,
    ogDescription: null as string | null,
    ogImageUrl: null as string | null,
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
    featured: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.products.push(row as (typeof store.products)[0]);
  if (row.imageUrl) {
    store.productImages.push({
      id: store.seq.productImage++,
      productId: row.id,
      imageUrl: row.imageUrl,
      sortOrder: 0,
      createdAt: new Date(),
    });
  }
  return row;
}


function memUniqueProductSlug(storeId: number, baseName: string): string {
  const base = (slugify(baseName) || "product").slice(0, 100);
  let candidate = base;
  for (let n = 2; n < 200; n++) {
    const clash = store.products.some(
      (p) => p.storeId === storeId && p.slug === candidate
    );
    if (!clash) return candidate;
    const suffix = `-${n}`;
    candidate = `${base.slice(0, Math.max(1, 100 - suffix.length))}${suffix}`;
  }
  throw new Error("Could not allocate unique product slug");
}

export function memDuplicateProduct(ownerId: number, productId: number) {
  const source = store.products.find((p) => p.id === productId);
  if (!source) throw new Error("Product not found");
  memGetStoreForOwner(source.storeId, ownerId);
  const slug = memUniqueProductSlug(source.storeId, `${source.name}-copy`);
  const copy = {
    ...source,
    id: store.seq.product++,
    name: `${source.name} (copy)`,
    slug,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.products.push(copy);
  const gallery = store.productImages
    .filter((i) => i.productId === productId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  for (let i = 0; i < gallery.length; i++) {
    store.productImages.push({
      id: store.seq.productImage++,
      productId: copy.id,
      imageUrl: gallery[i]!.imageUrl,
      sortOrder: i,
      createdAt: new Date(),
    });
  }
  if (gallery.length > 0) {
    copy.imageUrl = gallery[0]!.imageUrl;
  }
  return copy;
}

export function memBulkSetProductsActive(
  ownerId: number,
  productIds: number[],
  active: boolean
) {
  let updated = 0;
  for (const id of productIds) {
    const p = store.products.find((x) => x.id === id);
    if (!p) throw new Error("One or more products were not found");
    memGetStoreForOwner(p.storeId, ownerId);
    p.active = active;
    p.updatedAt = new Date();
    updated++;
  }
  return { updated };
}

export function memBulkDeleteProducts(ownerId: number, productIds: number[]) {
  const urlSet = new Set<string>();
  for (const id of productIds) {
    const p = store.products.find((x) => x.id === id);
    if (!p) throw new Error("One or more products were not found");
    memGetStoreForOwner(p.storeId, ownerId);
    if (p.imageUrl) urlSet.add(p.imageUrl);
    for (const img of store.productImages) {
      if (img.productId === id && img.imageUrl) urlSet.add(img.imageUrl);
    }
  }
  let deleted = 0;
  for (const id of productIds) {
    store.products = store.products.filter((x) => x.id !== id);
    store.productImages = store.productImages.filter((i) => i.productId !== id);
    deleted++;
  }
  return { deleted, imageUrls: [...urlSet] };
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

function memCreatePendingOrderUnlocked(input: {
  storeId: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  note?: string;
  items: CartItemInput[];
  paymentReference: string;
  couponCode?: string;
}) {
  const cart = memPriceCart(input.storeId, input.items);
  let discountKobo = 0;
  let couponCode: string | null = null;
  let totalKobo = cart.totalKobo;
  if (input.couponCode) {
    const applied = memValidateCouponForCart({
      storeId: input.storeId,
      code: input.couponCode,
      lines: cart.lines.map((l) => ({
        productId: l.productId,
        lineTotalKobo: l.lineTotalKobo,
      })),
      customerEmail: input.customerEmail,
      reserveUsage: true,
    });
    if (!applied.ok) throw new Error(applied.error);
    discountKobo = applied.discountKobo;
    couponCode = applied.code;
    totalKobo = applied.totalKobo;
  }
  const order = {
    id: store.seq.order++,
    storeId: input.storeId,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    customerEmail: input.customerEmail.toLowerCase().trim(),
    deliveryAddress: input.deliveryAddress.trim(),
    note: input.note?.trim() || "",
    subtotalKobo: cart.subtotalKobo,
    discountKobo,
    couponCode,
    totalKobo,
    currency: "NGN",
    paymentStatus: "pending",
    orderStatus: "pending",
    paymentReference: input.paymentReference,
    paystackAccessCode: null as string | null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  cart.totalKobo = totalKobo;
  // Reserve stock (decrement available)
  for (const line of cart.lines) {
    const product = store.products.find((p) => p.id === line.productId);
    if (!product || product.stock < line.quantity) {
      throw new Error(`Insufficient stock for ${line.name}`);
    }
    product.stock -= line.quantity;
    product.updatedAt = new Date();
  }

  const expiresAt = reservationExpiryDate();
  const orderWithRes = {
    ...order,
    stockReserved: true,
    reservationExpiresAt: expiresAt,
  };
  store.orders.push(orderWithRes as (typeof store.orders)[0]);

  for (const line of cart.lines) {
    store.orderItems.push({
      id: store.seq.item++,
      orderId: orderWithRes.id,
      productId: line.productId,
      productNameSnapshot: line.name,
      unitPriceKoboSnapshot: line.unitPriceKobo,
      quantity: line.quantity,
      lineTotalKobo: line.lineTotalKobo,
    } as (typeof store.orderItems)[0]);
  }

  store.payments.push({
    id: store.seq.payment++,
    orderId: orderWithRes.id,
    reference: input.paymentReference,
    amountKobo: cart.totalKobo,
    currency: "NGN",
    status: "pending",
    provider: "paystack",
    rawEventId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as (typeof store.payments)[0]);

  return { order: orderWithRes, cart };
}

export async function memCreatePendingOrder(input: {
  storeId: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  note?: string;
  items: import("@/lib/server/cart").CartItemInput[];
  paymentReference: string;
}) {
  const lockKey = "__inventory__";
  const prev = confirmLocks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const chain = prev.then(() => gate);
  confirmLocks.set(lockKey, chain);
  await prev;
  try {
    return memCreatePendingOrderUnlocked(input);
  } finally {
    release();
    if (confirmLocks.get(lockKey) === chain) {
      confirmLocks.delete(lockKey);
    }
  }
}


/** Idempotent: marks paid once, decrements stock once (or refund_required). */
export function memConfirmPaidOrder(reference: string, amountKobo: number) {
  const order = store.orders.find((o) => o.paymentReference === reference);
  if (!order) throw new Error("Order not found");

  if (order.paymentStatus === "paid") {
    return {
      order,
      alreadyPaid: true as const,
      refundRequired: order.orderStatus === "refund_required",
    };
  }

  if (order.paymentStatus === "failed") {
    throw new Error("Cannot confirm a failed payment");
  }

  if (amountKobo !== order.totalKobo) {
    throw new Error("Payment amount mismatch");
  }

  if (order.paymentStatus !== "pending") {
    return {
      order,
      alreadyPaid: true as const,
      refundRequired: order.orderStatus === "refund_required",
    };
  }

  const items = store.orderItems.filter((i) => i.orderId === order.id);
  const reserved = Boolean(order.stockReserved);
  const reservationExpired =
    reserved && isReservationExpired(order.reservationExpiresAt);

  if (reserved && !reservationExpired) {
    order.paymentStatus = "paid";
    order.orderStatus = "confirmed";
    order.stockReserved = false;
    order.reservationExpiresAt = null;
    order.updatedAt = new Date();
    const payment = store.payments.find((p) => p.reference === reference);
    if (payment) {
      payment.status = "paid";
      payment.updatedAt = new Date();
    }
    return {
      order,
      alreadyPaid: false as const,
      refundRequired: false as const,
    };
  }

  if (reserved && reservationExpired) {
    for (const item of items) {
      const product = store.products.find((p) => p.id === item.productId);
      if (product) {
        product.stock += item.quantity;
        product.updatedAt = new Date();
      }
    }
    order.paymentStatus = "paid";
    order.orderStatus = "refund_required";
    order.stockReserved = false;
    order.reservationExpiresAt = null;
    order.updatedAt = new Date();
    const payment = store.payments.find((p) => p.reference === reference);
    if (payment) {
      payment.status = "paid";
      payment.updatedAt = new Date();
    }
    return {
      order,
      alreadyPaid: false as const,
      refundRequired: true as const,
    };
  }

  // Legacy (no reservation)
  let stockOk = true;
  for (const item of items) {
    const product = store.products.find((p) => p.id === item.productId);
    if (!product || product.stock < item.quantity) {
      stockOk = false;
      break;
    }
  }

  if (!stockOk) {
    order.paymentStatus = "paid";
    order.orderStatus = "refund_required";
    order.updatedAt = new Date();
    const payment = store.payments.find((p) => p.reference === reference);
    if (payment) {
      payment.status = "paid";
      payment.updatedAt = new Date();
    }
    return {
      order,
      alreadyPaid: false as const,
      refundRequired: true as const,
    };
  }

  order.paymentStatus = "paid";
  order.orderStatus = "confirmed";
  order.stockReserved = false;
  order.reservationExpiresAt = null;
  order.updatedAt = new Date();

  for (const item of items) {
    const product = store.products.find((p) => p.id === item.productId);
    if (!product) continue;
    if (product.stock < item.quantity) {
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

  return {
    order,
    alreadyPaid: false as const,
    refundRequired: false as const,
  };
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
  if (order.paymentStatus === "failed") {
    return order;
  }
  if (order.couponCode) {
    memReleaseCouponUsage(order.storeId, order.couponCode);
  }
  if (order.stockReserved) {
    const items = store.orderItems.filter((i) => i.orderId === order.id);
    for (const item of items) {
      const product = store.products.find((p) => p.id === item.productId);
      if (product) {
        product.stock += item.quantity;
        product.updatedAt = new Date();
      }
    }
    order.stockReserved = false;
    order.reservationExpiresAt = null;
  }
  order.paymentStatus = "failed";
  if (order.orderStatus === "pending") order.orderStatus = "cancelled";
  order.updatedAt = new Date();
  const payment = store.payments.find((p) => p.reference === reference);
  if (payment && payment.status !== "paid") {
    payment.status = "failed";
    payment.updatedAt = new Date();
  }
  return order;
}

export function memReleaseExpiredOrderReservations(limit = 50): {
  released: number;
} {
  const now = new Date();
  const candidates = store.orders
    .filter(
      (o) =>
        o.stockReserved &&
        o.paymentStatus === "pending" &&
        isReservationExpired(o.reservationExpiresAt, now)
    )
    .slice(0, limit);

  let released = 0;
  for (const order of candidates) {
    if (!order.stockReserved || order.paymentStatus !== "pending") continue;
    const items = store.orderItems.filter((i) => i.orderId === order.id);
    for (const item of items) {
      const product = store.products.find((p) => p.id === item.productId);
      if (product) {
        product.stock += item.quantity;
        product.updatedAt = new Date();
      }
    }
    order.stockReserved = false;
    order.reservationExpiresAt = null;
    order.paymentStatus = "failed";
    order.orderStatus = "expired";
    order.updatedAt = new Date();
    const payment = store.payments.find(
      (p) => p.reference === order.paymentReference
    );
    if (payment && payment.status === "pending") {
      payment.status = "failed";
      payment.updatedAt = new Date();
    }
    released += 1;
  }
  return { released };
}

/**
 * Idempotent webhook processing using rawEventId + per-reference serialization.
 * Concurrent callers for the same reference run one-at-a-time so stock moves once.
 */
export async function memConfirmPaidOrderWithEvent(
  reference: string,
  amountKobo: number,
  rawEventId?: string | null
): Promise<{
  order: (typeof store.orders)[0];
  alreadyPaid: boolean;
  refundRequired?: boolean;
}> {
  const run = async () => {
    if (rawEventId) {
      const existing = store.payments.find((p) => p.rawEventId === rawEventId);
      if (existing) {
        const order = store.orders.find((o) => o.id === existing.orderId)!;
        return {
          order,
          alreadyPaid: true as const,
          refundRequired: order.orderStatus === "refund_required",
        };
      }
    }
    const result = memConfirmPaidOrder(reference, amountKobo);
    if (rawEventId) {
      const payment = store.payments.find((p) => p.reference === reference);
      if (payment) payment.rawEventId = rawEventId;
    }
    if (
      !result.alreadyPaid &&
      result.order.paymentStatus === "paid" &&
      !result.refundRequired
    ) {
      memRecordStoreEvent({
        storeId: result.order.storeId,
        eventType: "purchase_completed",
        metadata: JSON.stringify({
          orderId: result.order.id,
          totalKobo: result.order.totalKobo,
        }).slice(0, 500),
      });
    }
    return result;
  };

  // Global serialization so concurrent last-unit races across references are ordered
  // (Postgres uses FOR UPDATE on product rows for the same effect).
  const lockKey = "__inventory__";
  const prev = confirmLocks.get(lockKey) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const chain = prev.then(() => gate);
  confirmLocks.set(lockKey, chain);
  await prev;
  try {
    return await run();
  } finally {
    release();
    if (confirmLocks.get(lockKey) === chain) {
      confirmLocks.delete(lockKey);
    }
  }
}

/**
 * Memory-repo analytics for tests / USE_MEMORY_DB.
 * Owner-scoped: only stores owned by ownerId contribute.
 */
export function memGetSellerAnalytics(ownerId: number, periodDays: number) {
  const ownerStoreIds = new Set(
    store.stores.filter((s) => s.ownerId === ownerId).map((s) => s.id)
  );
  const orderList = store.orders
    .filter((o) => ownerStoreIds.has(o.storeId))
    .map((o) => ({
      id: o.id,
      storeId: o.storeId,
      totalKobo: o.totalKobo,
      paymentStatus: o.paymentStatus,
      orderStatus: o.orderStatus,
      createdAt: o.createdAt,
    }));
  const orderIds = new Set(orderList.map((o) => o.id));
  const items = store.orderItems
    .filter((i) => orderIds.has(i.orderId))
    .map((i) => ({
      orderId: i.orderId,
      productId: i.productId,
      productNameSnapshot: i.productNameSnapshot || "Product",
      quantity: i.quantity,
      lineTotalKobo: i.lineTotalKobo,
    }));
  return computeSellerAnalyticsFromData(periodDays, orderList, items);
}


export function memListInventoryForOwner(ownerId: number) {
  const ownerStores = store.stores.filter((s) => s.ownerId === ownerId);
  const nameById = new Map(ownerStores.map((s) => [s.id, s.name]));
  const ids = new Set(ownerStores.map((s) => s.id));
  return store.products
    .filter((p) => ids.has(p.storeId))
    .map((p) => ({
      ...p,
      storeName: nameById.get(p.storeId) ?? "Store",
    }))
    .sort((a, b) => b.id - a.id);
}

/**
 * products.stock is available units (reservations already decremented it).
 * Only non-negative available stock is enforced here.
 */
export function memAdjustProductStock(
  ownerId: number,
  productId: number,
  input: { mode: "set" | "delta"; value: number }
) {
  if (!Number.isSafeInteger(input.value)) {
    throw new Error("Invalid stock value");
  }
  if (input.mode === "set" && input.value < 0) {
    throw new Error("Stock cannot be negative");
  }
  const product = store.products.find((p) => p.id === productId);
  if (!product) throw new Error("Product not found");
  memGetStoreForOwner(product.storeId, ownerId);
  let next = product.stock;
  if (input.mode === "set") next = input.value;
  else next = product.stock + input.value;
  if (next < 0) throw new Error("Stock cannot be negative");
  product.stock = next;
  product.updatedAt = new Date();
  return product;
}

/** Atomic product update — validates stock before mutating any field. */
export function memUpdateProductAtomic(
  ownerId: number,
  productId: number,
  patch: Partial<{
    name: string;
    description: string;
    priceKobo: number;
    stock: number;
    category: string;
    imageUrl: string | null;
    active: boolean;
    featured: boolean;
  }>
) {
  const product = store.products.find((p) => p.id === productId);
  if (!product) throw new Error("Product not found");
  memGetStoreForOwner(product.storeId, ownerId);

  if (patch.stock !== undefined) {
    if (!Number.isSafeInteger(patch.stock) || patch.stock < 0) {
      throw new Error("Stock cannot be negative");
    }
  }

  // All-or-nothing: apply only after validation
  if (patch.name !== undefined) product.name = patch.name;
  if (patch.description !== undefined) product.description = patch.description;
  if (patch.priceKobo !== undefined) product.priceKobo = patch.priceKobo;
  if (patch.stock !== undefined) product.stock = patch.stock;
  if (patch.category !== undefined) product.category = patch.category;
  if (patch.imageUrl !== undefined) product.imageUrl = patch.imageUrl;
  if (patch.active !== undefined) product.active = patch.active;
  if (patch.featured !== undefined) product.featured = patch.featured;
  product.updatedAt = new Date();
  return product;
}


export function memListProductImages(productId: number) {
  const store = getMemoryStore();
  return store.productImages
    .filter((i) => i.productId === productId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
}

export function memListProductImagesForProducts(productIds: number[]) {
  const set = new Set(productIds);
  const store = getMemoryStore();
  const rows = store.productImages
    .filter((i) => set.has(i.productId))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const map = new Map<number, typeof rows>();
  for (const row of rows) {
    const list = map.get(row.productId) || [];
    list.push(row);
    map.set(row.productId, list);
  }
  return map;
}

export function memAddProductImage(
  ownerId: number,
  productId: number,
  imageUrl: string
) {
  const store = getMemoryStore();
  const product = store.products.find((p) => p.id === productId);
  if (!product) throw new Error("Product not found");
  memGetStoreForOwner(product.storeId, ownerId);
  const existing = store.productImages.filter((i) => i.productId === productId);
  const sortOrder =
    existing.length === 0
      ? 0
      : Math.max(...existing.map((i) => i.sortOrder)) + 1;
  const row = {
    id: store.seq.productImage++,
    productId,
    imageUrl,
    sortOrder,
    createdAt: new Date(),
  };
  store.productImages.push(row);
  if (!product.imageUrl) {
    product.imageUrl = imageUrl;
  }
  // Keep primary (sortOrder 0) in sync with products.imageUrl
  const primary = store.productImages
    .filter((i) => i.productId === productId)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id)[0];
  if (primary) product.imageUrl = primary.imageUrl;
  return row;
}

export function memDeleteProductImage(ownerId: number, imageId: number) {
  const store = getMemoryStore();
  const img = store.productImages.find((i) => i.id === imageId);
  if (!img) throw new Error("Image not found");
  const product = store.products.find((p) => p.id === img.productId);
  if (!product) throw new Error("Product not found");
  memGetStoreForOwner(product.storeId, ownerId);
  store.productImages = store.productImages.filter((i) => i.id !== imageId);
  const remaining = store.productImages
    .filter((i) => i.productId === product.id)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  product.imageUrl = remaining[0]?.imageUrl ?? null;
  return { deleted: img, productId: product.id };
}

export function memReorderProductImages(
  ownerId: number,
  productId: number,
  orderedImageIds: number[]
) {
  const store = getMemoryStore();
  const product = store.products.find((p) => p.id === productId);
  if (!product) throw new Error("Product not found");
  memGetStoreForOwner(product.storeId, ownerId);
  const images = store.productImages.filter((i) => i.productId === productId);
  const byId = new Map(images.map((i) => [i.id, i]));
  if (orderedImageIds.length !== images.length) {
    throw new Error("Image list mismatch");
  }
  for (const id of orderedImageIds) {
    if (!byId.has(id)) throw new Error("Image not found for product");
  }
  orderedImageIds.forEach((id, index) => {
    byId.get(id)!.sortOrder = index;
  });
  product.imageUrl = byId.get(orderedImageIds[0]!)?.imageUrl ?? product.imageUrl;
  return memListProductImages(productId);
}

/** Ensure legacy imageUrl appears in gallery for memory store. */
export function memEnsureLegacyGalleryImage(productId: number) {
  const store = getMemoryStore();
  const product = store.products.find((p) => p.id === productId);
  if (!product?.imageUrl) return;
  const exists = store.productImages.some(
    (i) => i.productId === productId && i.imageUrl === product.imageUrl
  );
  if (exists) return;
  store.productImages.push({
    id: store.seq.productImage++,
    productId,
    imageUrl: product.imageUrl,
    sortOrder: 0,
    createdAt: new Date(),
  });
}

/* ---- Coupons (memory) ---- */

export function memListCoupons(storeId: number) {
  return store.coupons
    .filter((c) => c.storeId === storeId)
    .map((c) => ({
      ...c,
      productIds: store.couponProducts
        .filter((l) => l.couponId === c.id)
        .map((l) => l.productId),
    }))
    .sort((a, b) => b.id - a.id);
}

export function memCreateCoupon(
  ownerId: number,
  input: {
    storeId: number;
    code: string;
    type: string;
    value: number;
    minimumOrderAmount: number;
    maximumDiscountAmount: number | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    usageLimit: number | null;
    perCustomerLimit: number | null;
    active: boolean;
    productIds: number[];
  }
) {
  memGetStoreForOwner(input.storeId, ownerId);
  if (
    store.coupons.some(
      (c) => c.storeId === input.storeId && c.code === input.code
    )
  ) {
    throw new Error("Coupon code already exists");
  }
  for (const pid of input.productIds) {
    const p = store.products.find((x) => x.id === pid);
    if (!p || p.storeId !== input.storeId) {
      throw new Error("One or more products are invalid for this store");
    }
  }
  const row = {
    id: store.seq.coupon++,
    storeId: input.storeId,
    code: input.code,
    type: input.type,
    value: input.value,
    minimumOrderAmount: input.minimumOrderAmount,
    maximumDiscountAmount: input.maximumDiscountAmount,
    startsAt: input.startsAt,
    expiresAt: input.expiresAt,
    usageLimit: input.usageLimit,
    usageCount: 0,
    perCustomerLimit: input.perCustomerLimit,
    active: input.active,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  store.coupons.push(row);
  for (const productId of input.productIds) {
    store.couponProducts.push({
      id: store.seq.couponProduct++,
      couponId: row.id,
      productId,
    });
  }
  return { ...row, productIds: input.productIds };
}

export function memUpdateCoupon(
  ownerId: number,
  couponId: number,
  patch: Partial<{
    code: string;
    type: CouponType;
    value: number;
    minimumOrderAmountNgn: number;
    maximumDiscountAmountNgn: number | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    usageLimit: number | null;
    perCustomerLimit: number | null;
    active: boolean;
    productIds: number[];
  }>
) {
  const row = store.coupons.find((c) => c.id === couponId);
  if (!row) throw new Error("Coupon not found");
  memGetStoreForOwner(row.storeId, ownerId);

  const finalType = (patch.type ?? row.type) as CouponType;
  let finalValue = row.value;
  if (patch.value !== undefined) {
    finalValue =
      finalType === "fixed" ? ngnMajorToKobo(patch.value) : patch.value;
  }
  assertCouponValue(finalType, finalValue);

  const finalStarts =
    patch.startsAt !== undefined ? patch.startsAt : row.startsAt;
  const finalExpires =
    patch.expiresAt !== undefined ? patch.expiresAt : row.expiresAt;
  assertCouponDates(finalStarts, finalExpires);

  const finalUsage =
    patch.usageLimit !== undefined ? patch.usageLimit : row.usageLimit;
  const finalPerCustomer =
    patch.perCustomerLimit !== undefined
      ? patch.perCustomerLimit
      : row.perCustomerLimit;
  assertOptionalPositiveInt("usage limit", finalUsage);
  assertOptionalPositiveInt("per-customer limit", finalPerCustomer);

  if (patch.code !== undefined) {
    const code = normalizeCouponCode(patch.code);
    if (code.length < 2) throw new Error("Invalid coupon code");
    row.code = code;
  }
  if (patch.type !== undefined) row.type = finalType;
  if (patch.value !== undefined || patch.type !== undefined) {
    row.value = finalValue;
  }
  if (patch.minimumOrderAmountNgn !== undefined) {
    const minK = ngnMajorToKobo(patch.minimumOrderAmountNgn);
    if (minK < 0) throw new Error("Invalid minimum order amount");
    row.minimumOrderAmount = minK;
  }
  if (patch.maximumDiscountAmountNgn !== undefined) {
    row.maximumDiscountAmount =
      patch.maximumDiscountAmountNgn == null
        ? null
        : ngnMajorToKobo(patch.maximumDiscountAmountNgn);
    if (row.maximumDiscountAmount != null && row.maximumDiscountAmount < 0) {
      throw new Error("Invalid maximum discount amount");
    }
  }
  if (patch.startsAt !== undefined) row.startsAt = patch.startsAt;
  if (patch.expiresAt !== undefined) row.expiresAt = patch.expiresAt;
  if (patch.usageLimit !== undefined) row.usageLimit = patch.usageLimit;
  if (patch.perCustomerLimit !== undefined) {
    row.perCustomerLimit = patch.perCustomerLimit;
  }
  if (patch.active !== undefined) row.active = patch.active;
  if (patch.productIds !== undefined) {
    for (const pid of patch.productIds) {
      const prod = store.products.find((x) => x.id === pid);
      if (!prod || prod.storeId !== row.storeId) {
        throw new Error("One or more products are invalid for this store");
      }
    }
    store.couponProducts = store.couponProducts.filter(
      (l) => l.couponId !== couponId
    );
    for (const productId of patch.productIds) {
      store.couponProducts.push({
        id: store.seq.couponProduct++,
        couponId,
        productId,
      });
    }
  }
  row.updatedAt = new Date();
  return {
    ...row,
    productIds: store.couponProducts
      .filter((l) => l.couponId === couponId)
      .map((l) => l.productId),
  };
}

export function memDeleteCoupon(ownerId: number, couponId: number) {
  const row = store.coupons.find((c) => c.id === couponId);
  if (!row) throw new Error("Coupon not found");
  memGetStoreForOwner(row.storeId, ownerId);
  store.coupons = store.coupons.filter((c) => c.id !== couponId);
  store.couponProducts = store.couponProducts.filter(
    (l) => l.couponId !== couponId
  );
  return { deleted: true };
}

export function memValidateCouponForCart(input: {
  storeId: number;
  code: string;
  lines: Array<{ productId: number; lineTotalKobo: number }>;
  customerEmail?: string;
  reserveUsage?: boolean;
}) {
  const code = normalizeCouponCode(input.code);
  const coupon = store.coupons.find(
    (c) => c.storeId === input.storeId && c.code === code
  );
  if (!coupon) return { ok: false as const, error: "Invalid coupon code" };
  if (!coupon.active) return { ok: false as const, error: "Coupon is inactive" };
  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    return { ok: false as const, error: "Coupon is not active yet" };
  }
  if (coupon.expiresAt && now > coupon.expiresAt) {
    return { ok: false as const, error: "Coupon has expired" };
  }
  if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
    return { ok: false as const, error: "Coupon usage limit reached" };
  }
  const subtotalKobo = input.lines.reduce((s, l) => s + l.lineTotalKobo, 0);
  if (coupon.perCustomerLimit != null && input.customerEmail) {
    const email = input.customerEmail.toLowerCase().trim();
    const used = store.orders.filter(
      (o) =>
        o.storeId === input.storeId &&
        o.couponCode === code &&
        o.customerEmail === email &&
        o.paymentStatus !== "failed"
    );
    if (used.length >= coupon.perCustomerLimit) {
      return {
        ok: false as const,
        error: "Coupon per-customer limit reached",
      };
    }
  }
  const restricted = store.couponProducts
    .filter((l) => l.couponId === coupon.id)
    .map((l) => l.productId);
  const eligibleLines =
    restricted.length === 0
      ? input.lines
      : input.lines.filter((l) => restricted.includes(l.productId));
  const eligibleSubtotal = eligibleLines.reduce(
    (s, l) => s + l.lineTotalKobo,
    0
  );
  if (restricted.length > 0 && eligibleSubtotal <= 0) {
    return {
      ok: false as const,
      error: "Coupon does not apply to items in your cart",
    };
  }
  if (coupon.minimumOrderAmount > 0 && subtotalKobo < coupon.minimumOrderAmount) {
    return {
      ok: false as const,
      error: "Order does not meet the minimum amount for this coupon",
    };
  }
  const { discountKobo, totalKobo } = computeDiscount({
    type: coupon.type as CouponType,
    value: coupon.value,
    eligibleSubtotalKobo: eligibleSubtotal,
    cartSubtotalKobo: subtotalKobo,
    minimumOrderAmountKobo: coupon.minimumOrderAmount,
    maximumDiscountAmountKobo: coupon.maximumDiscountAmount,
  });
  if (discountKobo <= 0) {
    return { ok: false as const, error: "Coupon does not reduce this order" };
  }
  if (input.reserveUsage) {
    if (coupon.usageLimit != null && coupon.usageCount >= coupon.usageLimit) {
      return { ok: false as const, error: "Coupon usage limit reached" };
    }
    coupon.usageCount += 1;
    coupon.updatedAt = new Date();
  }
  return {
    ok: true as const,
    code: coupon.code,
    type: coupon.type,
    discountKobo,
    subtotalKobo,
    totalKobo,
    message: "Coupon applied",
  };
}

export function memReleaseCouponUsage(storeId: number, code: string) {
  const coupon = store.coupons.find(
    (c) => c.storeId === storeId && c.code === code
  );
  if (coupon && coupon.usageCount > 0) {
    coupon.usageCount -= 1;
    coupon.updatedAt = new Date();
  }
}

export function memRecordStoreEvent(input: {
  storeId: number;
  productId?: number;
  eventType: string;
  visitorId?: string;
  metadata?: string | null;
}) {
  store.storeEvents.push({
    id: store.seq.storeEvent++,
    storeId: input.storeId,
    productId: input.productId ?? null,
    eventType: input.eventType,
    visitorId: input.visitorId || null,
    metadata: input.metadata ?? null,
    createdAt: new Date(),
  });
}

export function memCountStoreEvents(
  storeIds: number[],
  eventType: string,
  since: Date
): number {
  return store.storeEvents.filter(
    (e) =>
      storeIds.includes(e.storeId) &&
      e.eventType === eventType &&
      e.createdAt >= since
  ).length;
}

export function memCreateNotification(input: {
  storeId: number;
  type: string;
  title: string;
  message: string;
  relatedOrderId?: number | null;
  relatedProductId?: number | null;
  relatedCouponId?: number | null;
  href?: string | null;
  dedupeKey: string;
}) {
  if (
    store.notifications.some(
      (n) => n.storeId === input.storeId && n.dedupeKey === input.dedupeKey
    )
  ) {
    return null;
  }
  const row = {
    id: store.seq.notification++,
    storeId: input.storeId,
    type: input.type,
    title: input.title.slice(0, 160),
    message: input.message,
    relatedOrderId: input.relatedOrderId ?? null,
    relatedProductId: input.relatedProductId ?? null,
    relatedCouponId: input.relatedCouponId ?? null,
    href: input.href ?? null,
    read: false,
    dedupeKey: input.dedupeKey,
    createdAt: new Date(),
  };
  store.notifications.push(row);
  return row;
}
