/**
 * Production repository (Drizzle). Falls back to memory when DATABASE_URL is unset
 * or USE_MEMORY_DB=1 (tests / local without Postgres).
 */
import { eq, and, desc, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  users,
  stores,
  products,
  orders,
  orderItems,
  payments,
} from "@/db/schema";
import * as mem from "@/lib/server/memory-repo";
import { hashPassword, verifyPassword } from "@/lib/server/password";
import { slugify, isValidSlug } from "@/lib/slug";
import { assertPositiveKobo } from "@/lib/money";
import type { CartItemInput } from "@/lib/server/cart";
import { priceCart } from "@/lib/server/cart";
import { allowMemoryDb, isProduction, requireDatabaseUrl } from "@/lib/server/config";

export function useMemory(): boolean {
  if (isProduction()) {
    // Force Postgres — never silent memory fallback in production.
    requireDatabaseUrl();
    return false;
  }
  if (allowMemoryDb()) return true;
  // Local/dev without explicit memory flag still allows missing DATABASE_URL for DX,
  // but only when not production.
  return !process.env.DATABASE_URL;
}

export async function signupUser(input: {
  email: string;
  password: string;
  fullName: string;
}) {
  if (useMemory()) return mem.memSignup(input);
  const db = getDb();
  const email = input.email.toLowerCase().trim();
  const existing = await db
    .select()
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing[0]) throw new Error("Email already registered");
  const passwordHash = await hashPassword(input.password);
  const rows = await db
    .insert(users)
    .values({
      email,
      passwordHash,
      fullName: input.fullName.trim(),
    })
    .returning();
  const u = rows[0];
  return { id: u.id, email: u.email, fullName: u.fullName };
}

export async function loginUser(email: string, password: string) {
  if (useMemory()) return mem.memLogin(email, password);
  const db = getDb();
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  const user = rows[0];
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new Error("Invalid email or password");
  }
  return { id: user.id, email: user.email, fullName: user.fullName };
}

export async function createStore(input: {
  ownerId: number;
  name: string;
  slug?: string;
  description?: string;
  phone?: string;
  whatsapp?: string;
  email?: string;
  address?: string;
}) {
  if (useMemory()) return mem.memCreateStore(input);
  const db = getDb();
  const slug = input.slug ? slugify(input.slug) : slugify(input.name);
  if (!isValidSlug(slug)) throw new Error("Invalid store slug");
  const rows = await db
    .insert(stores)
    .values({
      ownerId: input.ownerId,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || "",
      phone: input.phone || null,
      whatsapp: input.whatsapp || null,
      email: input.email || null,
      address: input.address || null,
      currency: "NGN",
    })
    .returning();
  return rows[0];
}

export async function getStoreBySlug(slug: string) {
  if (useMemory()) return mem.memGetStoreBySlug(slug);
  const db = getDb();
  const rows = await db
    .select()
    .from(stores)
    .where(eq(stores.slug, slug))
    .limit(1);
  return rows[0] ?? null;
}

export async function getStoreOwned(storeId: number, ownerId: number) {
  if (useMemory()) return mem.memGetStoreForOwner(storeId, ownerId);
  const db = getDb();
  const rows = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, storeId), eq(stores.ownerId, ownerId)))
    .limit(1);
  if (!rows[0]) throw new Error("Store not found");
  return rows[0];
}

export async function getProductOwned(productId: number, ownerId: number) {
  if (useMemory()) {
    const row = mem.getMemoryStore().products.find((x) => x.id === productId);
    if (!row) throw new Error("Product not found");
    mem.memGetStoreForOwner(row.storeId, ownerId);
    return row;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  const row = rows[0];
  if (!row) throw new Error("Product not found");
  await getStoreOwned(row.storeId, ownerId);
  return row;
}

export async function listStoresForOwner(ownerId: number) {
  if (useMemory()) {
    return mem.getMemoryStore().stores.filter((s) => s.ownerId === ownerId);
  }
  const db = getDb();
  return db.select().from(stores).where(eq(stores.ownerId, ownerId));
}

export async function updateStore(
  ownerId: number,
  storeId: number,
  patch: Partial<{
    name: string;
    description: string;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    address: string | null;
    logoUrl: string | null;
    bannerUrl: string | null;
    instagramUrl: string | null;
    facebookUrl: string | null;
    twitterUrl: string | null;
    tiktokUrl: string | null;
  }>
) {
  await getStoreOwned(storeId, ownerId);
  if (useMemory()) {
    const s = mem.getMemoryStore().stores.find((x) => x.id === storeId)!;
    Object.assign(s, { ...patch, updatedAt: new Date() });
    return s;
  }
  const db = getDb();
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.phone !== undefined) values.phone = patch.phone;
  if (patch.whatsapp !== undefined) values.whatsapp = patch.whatsapp;
  if (patch.email !== undefined) values.email = patch.email;
  if (patch.address !== undefined) values.address = patch.address;
  if (patch.logoUrl !== undefined) values.logoUrl = patch.logoUrl;
  if (patch.bannerUrl !== undefined) values.bannerUrl = patch.bannerUrl;
  if (patch.instagramUrl !== undefined) values.instagramUrl = patch.instagramUrl;
  if (patch.facebookUrl !== undefined) values.facebookUrl = patch.facebookUrl;
  if (patch.twitterUrl !== undefined) values.twitterUrl = patch.twitterUrl;
  if (patch.tiktokUrl !== undefined) values.tiktokUrl = patch.tiktokUrl;
  const rows = await db
    .update(stores)
    .set(values)
    .where(eq(stores.id, storeId))
    .returning();
  return rows[0];
}

export async function createProduct(input: {
  ownerId: number;
  storeId: number;
  name: string;
  description?: string;
  priceKobo: number;
  stock: number;
  category?: string;
  imageUrl?: string;
}) {
  if (useMemory()) return mem.memCreateProduct(input);
  await getStoreOwned(input.storeId, input.ownerId);
  assertPositiveKobo(input.priceKobo);
  const db = getDb();
  let slug = slugify(input.name);
  const rows = await db
    .insert(products)
    .values({
      storeId: input.storeId,
      name: input.name.trim(),
      slug,
      description: input.description?.trim() || "",
      priceKobo: input.priceKobo,
      stock: input.stock,
      category: input.category || "General",
      imageUrl: input.imageUrl || null,
      active: true,
    })
    .returning();
  return rows[0];
}

export async function listProducts(storeId: number, activeOnly = false) {
  if (useMemory()) return mem.memListProducts(storeId, activeOnly);
  const db = getDb();
  if (activeOnly) {
    return db
      .select()
      .from(products)
      .where(and(eq(products.storeId, storeId), eq(products.active, true)));
  }
  return db.select().from(products).where(eq(products.storeId, storeId));
}

export async function updateProduct(
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
  if (useMemory()) {
    const p = mem.getMemoryStore().products.find((x) => x.id === productId);
    if (!p) throw new Error("Product not found");
    mem.memGetStoreForOwner(p.storeId, ownerId);
    Object.assign(p, patch, { updatedAt: new Date() });
    if (patch.imageUrl === null) (p as { imageUrl: string | null }).imageUrl = null;
    return p;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  const p = rows[0];
  if (!p) throw new Error("Product not found");
  await getStoreOwned(p.storeId, ownerId);
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.description !== undefined) values.description = patch.description;
  if (patch.priceKobo !== undefined) {
    assertPositiveKobo(patch.priceKobo);
    values.priceKobo = patch.priceKobo;
  }
  if (patch.stock !== undefined) values.stock = patch.stock;
  if (patch.category !== undefined) values.category = patch.category;
  if (patch.imageUrl !== undefined) values.imageUrl = patch.imageUrl;
  if (patch.active !== undefined) values.active = patch.active;
  if (patch.featured !== undefined) values.featured = patch.featured;
  const updated = await db
    .update(products)
    .set(values)
    .where(eq(products.id, productId))
    .returning();
  return updated[0];
}

export async function deleteProduct(ownerId: number, productId: number) {
  if (useMemory()) {
    const list = mem.getMemoryStore().products;
    const idx = list.findIndex((x) => x.id === productId);
    if (idx < 0) throw new Error("Product not found");
    mem.memGetStoreForOwner(list[idx].storeId, ownerId);
    list.splice(idx, 1);
    return;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!rows[0]) throw new Error("Product not found");
  await getStoreOwned(rows[0].storeId, ownerId);
  await db.delete(products).where(eq(products.id, productId));
}

export async function createPendingOrder(input: {
  storeId: number;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  deliveryAddress: string;
  note?: string;
  items: CartItemInput[];
  paymentReference: string;
}) {
  if (useMemory()) return mem.memCreatePendingOrder(input);

  const db = getDb();
  const productRows = await db
    .select()
    .from(products)
    .where(eq(products.storeId, input.storeId));
  const cart = priceCart(input.items, productRows);

  return db.transaction(async (tx) => {
    const orderRows = await tx
      .insert(orders)
      .values({
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
      })
      .returning();
    const order = orderRows[0];

    for (const line of cart.lines) {
      await tx.insert(orderItems).values({
        orderId: order.id,
        productId: line.productId,
        productNameSnapshot: line.name,
        unitPriceKoboSnapshot: line.unitPriceKobo,
        quantity: line.quantity,
        lineTotalKobo: line.lineTotalKobo,
      });
    }

    await tx.insert(payments).values({
      orderId: order.id,
      reference: input.paymentReference,
      amountKobo: cart.totalKobo,
      currency: "NGN",
      status: "pending",
      provider: "paystack",
    });

    return { order, cart };
  });
}

export async function confirmPaidOrder(
  reference: string,
  amountKobo: number,
  rawEventId?: string | null
) {
  if (useMemory()) {
    return mem.memConfirmPaidOrderWithEvent(
      reference,
      amountKobo,
      rawEventId
    );
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    // Idempotent on provider event id when present
    if (rawEventId) {
      const byEvent = await tx
        .select()
        .from(payments)
        .where(eq(payments.rawEventId, rawEventId))
        .limit(1);
      if (byEvent[0]) {
        const paidOrder = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, byEvent[0].orderId))
          .limit(1);
        if (paidOrder[0]) {
          return {
            order: paidOrder[0],
            alreadyPaid: true as const,
            refundRequired: paidOrder[0].orderStatus === "refund_required",
          };
        }
      }
    }

    // Row lock: concurrent confirmations for the same reference serialize here
    const orderRows = await tx
      .select()
      .from(orders)
      .where(eq(orders.paymentReference, reference))
      .limit(1)
      .for("update");
    const order = orderRows[0];
    if (!order) throw new Error("Order not found");

    // Terminal success states (fulfilled or paid-but-unfulfillable)
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

    const items = await tx
      .select()
      .from(orderItems)
      .where(eq(orderItems.orderId, order.id));

    // Lock product rows in id order to avoid deadlocks across concurrent orders
    const productIds = [
      ...new Set(
        items
          .map((i) => i.productId)
          .filter((id): id is number => typeof id === "number" && id > 0)
      ),
    ].sort((a, b) => a - b);

    const lockedProducts = new Map<
      number,
      { id: number; stock: number; name: string }
    >();
    for (const pid of productIds) {
      const rows = await tx
        .select()
        .from(products)
        .where(eq(products.id, pid))
        .limit(1)
        .for("update");
      if (rows[0]) {
        lockedProducts.set(pid, {
          id: rows[0].id,
          stock: rows[0].stock,
          name: rows[0].name,
        });
      }
    }

    let stockOk = true;
    for (const item of items) {
      if (!item.productId) continue;
      const p = lockedProducts.get(item.productId);
      if (!p || p.stock < item.quantity) {
        stockOk = false;
        break;
      }
    }

    if (!stockOk) {
      // Payment received, inventory cannot be fulfilled — explicit refund path
      const claimed = await tx
        .update(orders)
        .set({
          paymentStatus: "paid",
          orderStatus: "refund_required",
          updatedAt: new Date(),
        })
        .where(
          and(eq(orders.id, order.id), eq(orders.paymentStatus, "pending"))
        )
        .returning();

      if (!claimed[0]) {
        const refreshed = await tx
          .select()
          .from(orders)
          .where(eq(orders.id, order.id))
          .limit(1);
        return {
          order: refreshed[0] ?? order,
          alreadyPaid: true as const,
          refundRequired: (refreshed[0] ?? order).orderStatus === "refund_required",
        };
      }

      try {
        await tx
          .update(payments)
          .set({
            status: "paid",
            updatedAt: new Date(),
            ...(rawEventId ? { rawEventId } : {}),
          })
          .where(eq(payments.reference, reference));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (rawEventId && /unique|duplicate/i.test(msg)) {
          return {
            order: claimed[0],
            alreadyPaid: true as const,
            refundRequired: true,
          };
        }
        throw err;
      }

      return {
        order: claimed[0],
        alreadyPaid: false as const,
        refundRequired: true as const,
      };
    }

    // Conditional claim: only the first tx that still sees pending proceeds
    const claimed = await tx
      .update(orders)
      .set({
        paymentStatus: "paid",
        orderStatus: "confirmed",
        updatedAt: new Date(),
      })
      .where(
        and(eq(orders.id, order.id), eq(orders.paymentStatus, "pending"))
      )
      .returning();

    if (!claimed[0]) {
      const refreshed = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, order.id))
        .limit(1);
      return {
        order: refreshed[0] ?? order,
        alreadyPaid: true as const,
        refundRequired: (refreshed[0] ?? order).orderStatus === "refund_required",
      };
    }

    for (const item of items) {
      if (!item.productId) continue;
      const updated = await tx
        .update(products)
        .set({
          stock: sql`${products.stock} - ${item.quantity}`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(products.id, item.productId),
            sql`${products.stock} >= ${item.quantity}`
          )
        )
        .returning();
      if (!updated[0]) {
        // Should not happen after FOR UPDATE pre-check — abort transaction
        throw new Error("Insufficient stock at payment confirmation");
      }
    }

    try {
      await tx
        .update(payments)
        .set({
          status: "paid",
          updatedAt: new Date(),
          ...(rawEventId ? { rawEventId } : {}),
        })
        .where(eq(payments.reference, reference));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (rawEventId && /unique|duplicate/i.test(msg)) {
        return {
          order: claimed[0],
          alreadyPaid: true as const,
          refundRequired: false,
        };
      }
      throw err;
    }

    return {
      order: claimed[0],
      alreadyPaid: false as const,
      refundRequired: false as const,
    };
  });
}

export async function getOrderByReference(reference: string) {
  if (useMemory()) {
    return (
      mem.getMemoryStore().orders.find((o) => o.paymentReference === reference) ??
      null
    );
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentReference, reference))
    .limit(1);
  return rows[0] ?? null;
}

export async function listOrdersForOwner(ownerId: number) {
  if (useMemory()) return mem.memListOrdersForOwner(ownerId);
  const db = getDb();
  const ownerStores = await db
    .select()
    .from(stores)
    .where(eq(stores.ownerId, ownerId));
  const ids = ownerStores.map((s) => s.id);
  if (ids.length === 0) return [];
  return db
    .select()
    .from(orders)
    .where(sql`${orders.storeId} in ${ids}`)
    .orderBy(desc(orders.id));
}

export async function updateOrderStatus(
  ownerId: number,
  orderId: number,
  orderStatus: string
) {
  // Fulfillment transitions sellers may apply. refund_required is terminal
  // until a dedicated refund-resolution feature is added.
  const fulfillmentStatuses = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ] as const;

  if (!(fulfillmentStatuses as readonly string[]).includes(orderStatus)) {
    throw new Error("Invalid order status");
  }

  if (useMemory()) {
    const order = mem.getMemoryStore().orders.find((o) => o.id === orderId);
    if (!order) throw new Error("Order not found");
    mem.memGetStoreForOwner(order.storeId, ownerId);
    if (order.orderStatus === "refund_required") {
      throw new Error(
        "Order requires a refund and cannot be moved to fulfillment statuses"
      );
    }
    order.orderStatus = orderStatus;
    order.updatedAt = new Date();
    return order;
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  if (!rows[0]) throw new Error("Order not found");
  await getStoreOwned(rows[0].storeId, ownerId);

  if (rows[0].orderStatus === "refund_required") {
    throw new Error(
      "Order requires a refund and cannot be moved to fulfillment statuses"
    );
  }

  const updated = await db
    .update(orders)
    .set({ orderStatus, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();
  return updated[0];
}

export async function dashboardStats(ownerId: number) {
  if (useMemory()) return mem.memDashboardStats(ownerId);
  const orderList = await listOrdersForOwner(ownerId);
  const paid = orderList.filter((o) => o.paymentStatus === "paid");
  const salesKobo = paid.reduce((s, o) => s + o.totalKobo, 0);
  const ownerStores = await listStoresForOwner(ownerId);
  let productCount = 0;
  for (const s of ownerStores) {
    productCount += (await listProducts(s.id)).length;
  }
  const customers = new Set(paid.map((o) => o.customerEmail.toLowerCase())).size;
  return {
    salesKobo,
    orderCount: orderList.length,
    productCount,
    customerCount: customers,
    recentOrders: orderList.slice(0, 10),
  };
}


export async function markOrderPaymentFailed(reference: string) {
  if (useMemory()) return mem.memMarkOrderPaymentFailed(reference);
  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(eq(orders.paymentReference, reference))
    .limit(1);
  const order = rows[0];
  if (!order) throw new Error("Order not found");
  if (order.paymentStatus === "paid") {
    throw new Error("Cannot fail a paid order");
  }
  await db
    .update(orders)
    .set({ paymentStatus: "failed", updatedAt: new Date() })
    .where(eq(orders.id, order.id));
  await db
    .update(payments)
    .set({ status: "failed", updatedAt: new Date() })
    .where(eq(payments.reference, reference));
  return { ...order, paymentStatus: "failed" as const };
}
