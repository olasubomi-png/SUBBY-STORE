/**
 * Advanced seller order management: filtering, pagination, transitions, bulk.
 * Payment status remains controlled only by Paystack verification paths.
 */
import { and, desc, eq, gte, inArray, lte, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/db/client";
import { orders, orderItems, stores, products } from "@/db/schema";
import { useMemory, getStoreOwned, listOrderItems } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";

export const FULFILLMENT_STATUSES = [
  "pending",
  "confirmed",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

/** Allowed seller-driven transitions. refund_required / expired are terminal here. */
export { ALLOWED_TRANSITIONS } from "@/lib/orders/transitions";
import { ALLOWED_TRANSITIONS } from "@/lib/orders/transitions";

export type OrderListFilters = {
  q?: string;
  paymentStatus?: string;
  orderStatus?: string;
  from?: string; // ISO date
  to?: string;
  minTotalKobo?: number;
  maxTotalKobo?: number;
  page?: number;
  pageSize?: number;
};

export type OrderSummary = {
  totalOrders: number;
  pending: number;
  paid: number;
  processing: number;
  completed: number;
  cancelled: number;
  revenueKobo: number;
};

function ownerStoreIdsSync(ownerId: number): number[] {
  return mem
    .getMemoryStore()
    .stores.filter((s) => s.ownerId === ownerId)
    .map((s) => s.id);
}

async function ownerStoreIds(ownerId: number): Promise<number[]> {
  if (useMemory()) return ownerStoreIdsSync(ownerId);
  const db = getDb();
  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, ownerId));
  return rows.map((r) => r.id);
}

function parseDayStart(iso: string): Date | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return d;
}

function parseDayEnd(iso: string): Date | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(23, 59, 59, 999);
  return d;
}

function matchesQuery(
  o: {
    id: number;
    customerName: string;
    customerPhone: string;
    customerEmail: string;
    paymentReference: string | null;
  },
  q: string
): boolean {
  const s = q.toLowerCase();
  return (
    String(o.id).includes(s) ||
    o.customerName.toLowerCase().includes(s) ||
    o.customerPhone.toLowerCase().includes(s) ||
    o.customerEmail.toLowerCase().includes(s) ||
    (o.paymentReference || "").toLowerCase().includes(s)
  );
}

function computeSummary(
  list: Array<{ paymentStatus: string; orderStatus: string; totalKobo: number }>
): OrderSummary {
  let pending = 0;
  let paid = 0;
  let processing = 0;
  let completed = 0;
  let cancelled = 0;
  let revenueKobo = 0;
  for (const o of list) {
    if (o.paymentStatus === "pending") pending += 1;
    if (o.paymentStatus === "paid") {
      paid += 1;
      revenueKobo += o.totalKobo;
    }
    if (o.orderStatus === "processing" || o.orderStatus === "shipped") {
      processing += 1;
    }
    if (o.orderStatus === "delivered") completed += 1;
    if (o.orderStatus === "cancelled" || o.orderStatus === "expired") {
      cancelled += 1;
    }
  }
  return {
    totalOrders: list.length,
    pending,
    paid,
    processing,
    completed,
    cancelled,
    revenueKobo,
  };
}

export async function listOrdersManaged(
  ownerId: number,
  filters: OrderListFilters = {}
): Promise<{
  orders: Array<Record<string, unknown>>;
  total: number;
  page: number;
  pageSize: number;
  summary: OrderSummary;
}> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, filters.pageSize ?? 20));
  const storeIds = await ownerStoreIds(ownerId);
  if (storeIds.length === 0) {
    return {
      orders: [],
      total: 0,
      page,
      pageSize,
      summary: computeSummary([]),
    };
  }

  if (useMemory()) {
    let list = mem
      .getMemoryStore()
      .orders.filter((o) => storeIds.includes(o.storeId));
    const summary = computeSummary(list);
    if (filters.q?.trim()) {
      const q = filters.q.trim();
      list = list.filter((o) => matchesQuery(o, q));
    }
    if (filters.paymentStatus && filters.paymentStatus !== "all") {
      list = list.filter((o) => o.paymentStatus === filters.paymentStatus);
    }
    if (filters.orderStatus && filters.orderStatus !== "all") {
      list = list.filter((o) => o.orderStatus === filters.orderStatus);
    }
    if (filters.from) {
      const from = parseDayStart(filters.from);
      if (from) list = list.filter((o) => o.createdAt >= from);
    }
    if (filters.to) {
      const to = parseDayEnd(filters.to);
      if (to) list = list.filter((o) => o.createdAt <= to);
    }
    if (filters.minTotalKobo != null) {
      list = list.filter((o) => o.totalKobo >= filters.minTotalKobo!);
    }
    if (filters.maxTotalKobo != null) {
      list = list.filter((o) => o.totalKobo <= filters.maxTotalKobo!);
    }
    list = [...list].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    const total = list.length;
    const start = (page - 1) * pageSize;
    return {
      orders: list.slice(start, start + pageSize) as unknown as Array<
        Record<string, unknown>
      >,
      total,
      page,
      pageSize,
      summary,
    };
  }

  const db = getDb();
  // Summary over all owner orders (unfiltered metrics)
  const allForSummary = await db
    .select({
      paymentStatus: orders.paymentStatus,
      orderStatus: orders.orderStatus,
      totalKobo: orders.totalKobo,
    })
    .from(orders)
    .where(inArray(orders.storeId, storeIds));
  const summary = computeSummary(allForSummary);

  const conditions: SQL[] = [inArray(orders.storeId, storeIds)];
  if (filters.paymentStatus && filters.paymentStatus !== "all") {
    conditions.push(eq(orders.paymentStatus, filters.paymentStatus));
  }
  if (filters.orderStatus && filters.orderStatus !== "all") {
    conditions.push(eq(orders.orderStatus, filters.orderStatus));
  }
  if (filters.from) {
    const from = parseDayStart(filters.from);
    if (from) conditions.push(gte(orders.createdAt, from));
  }
  if (filters.to) {
    const to = parseDayEnd(filters.to);
    if (to) conditions.push(lte(orders.createdAt, to));
  }
  if (filters.minTotalKobo != null && Number.isFinite(filters.minTotalKobo)) {
    conditions.push(gte(orders.totalKobo, filters.minTotalKobo));
  }
  if (filters.maxTotalKobo != null && Number.isFinite(filters.maxTotalKobo)) {
    conditions.push(lte(orders.totalKobo, filters.maxTotalKobo));
  }
  if (filters.q?.trim()) {
    const q = filters.q.trim();
    const like = `%${q}%`;
    conditions.push(
      or(
        sql`cast(${orders.id} as text) ilike ${like}`,
        sql`${orders.customerName} ilike ${like}`,
        sql`${orders.customerPhone} ilike ${like}`,
        sql`${orders.customerEmail} ilike ${like}`,
        sql`coalesce(${orders.paymentReference}, '') ilike ${like}`
      )!
    );
  }

  const where = and(...conditions);
  const countRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(orders)
    .where(where);
  const total = Number(countRows[0]?.c || 0);
  const rows = await db
    .select()
    .from(orders)
    .where(where)
    .orderBy(desc(orders.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return {
    orders: rows as unknown as Array<Record<string, unknown>>,
    total,
    page,
    pageSize,
    summary,
  };
}

export async function getOrderDetailForOwner(ownerId: number, orderId: number) {
  const storeIds = await ownerStoreIds(ownerId);
  if (storeIds.length === 0) return null;

  if (useMemory()) {
    const order = mem
      .getMemoryStore()
      .orders.find((o) => o.id === orderId && storeIds.includes(o.storeId));
    if (!order) return null;
    const items = mem
      .getMemoryStore()
      .orderItems.filter((i) => i.orderId === orderId);
    const store = mem.getMemoryStore().stores.find((s) => s.id === order.storeId);
    return { order, items, store: store ?? null };
  }

  const db = getDb();
  const rows = await db
    .select()
    .from(orders)
    .where(and(eq(orders.id, orderId), inArray(orders.storeId, storeIds)))
    .limit(1);
  if (!rows[0]) return null;
  const items = await db
    .select()
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const storeRows = await db
    .select()
    .from(stores)
    .where(eq(stores.id, rows[0].storeId))
    .limit(1);
  return { order: rows[0], items, store: storeRows[0] ?? null };
}

function assertTransition(from: string, to: string) {
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    throw new Error(`Cannot change status from ${from} to ${to}`);
  }
}

/**
 * Seller fulfillment status update with transition checks.
 * Releases reserved stock when cancelling an unpaid reserved order.
 * Never changes paymentStatus.
 */
export async function updateFulfillmentStatus(
  ownerId: number,
  orderId: number,
  nextStatus: string
) {
  if (!(FULFILLMENT_STATUSES as readonly string[]).includes(nextStatus)) {
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
    assertTransition(order.orderStatus, nextStatus);
    // Cancel unpaid reserved → release stock
    if (
      nextStatus === "cancelled" &&
      order.paymentStatus === "pending" &&
      order.stockReserved
    ) {
      const items = mem
        .getMemoryStore()
        .orderItems.filter((i) => i.orderId === orderId);
      for (const item of items) {
        if (!item.productId) continue;
        const p = mem
          .getMemoryStore()
          .products.find((x) => x.id === item.productId);
        if (p) p.stock += item.quantity;
      }
      order.stockReserved = false;
      order.reservationExpiresAt = null;
    }
    order.orderStatus = nextStatus;
    order.updatedAt = new Date();
    return order;
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, orderId))
      .limit(1)
      .for("update");
    if (!rows[0]) throw new Error("Order not found");
    await getStoreOwned(rows[0].storeId, ownerId);

    if (rows[0].orderStatus === "refund_required") {
      throw new Error(
        "Order requires a refund and cannot be moved to fulfillment statuses"
      );
    }
    assertTransition(rows[0].orderStatus, nextStatus);

    if (
      nextStatus === "cancelled" &&
      rows[0].paymentStatus === "pending" &&
      rows[0].stockReserved
    ) {
      const items = await tx
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      const productIds = [
        ...new Set(
          items
            .map((i) => i.productId)
            .filter((id): id is number => typeof id === "number")
        ),
      ].sort((a, b) => a - b);
      for (const pid of productIds) {
        await tx
          .select()
          .from(products)
          .where(eq(products.id, pid))
          .limit(1)
          .for("update");
      }
      for (const item of items) {
        if (!item.productId) continue;
        await tx
          .update(products)
          .set({
            stock: sql`${products.stock} + ${item.quantity}`,
            updatedAt: new Date(),
          })
          .where(eq(products.id, item.productId));
      }
    }

    const updated = await tx
      .update(orders)
      .set({
        orderStatus: nextStatus,
        updatedAt: new Date(),
        ...(nextStatus === "cancelled" &&
        rows[0].paymentStatus === "pending" &&
        rows[0].stockReserved
          ? { stockReserved: false, reservationExpiresAt: null }
          : {}),
      })
      .where(eq(orders.id, orderId))
      .returning();
    return updated[0];
  });
}

export async function bulkUpdateFulfillmentStatus(
  ownerId: number,
  orderIds: number[],
  nextStatus: string
): Promise<{
  results: Array<{ orderId: number; ok: boolean; error?: string }>;
}> {
  const unique = [...new Set(orderIds)].filter((id) =>
    Number.isSafeInteger(id)
  );
  const results: Array<{ orderId: number; ok: boolean; error?: string }> = [];
  for (const orderId of unique) {
    try {
      await updateFulfillmentStatus(ownerId, orderId, nextStatus);
      results.push({ orderId, ok: true });
    } catch (e) {
      results.push({
        orderId,
        ok: false,
        error: e instanceof Error ? e.message : "Failed",
      });
    }
  }
  return { results };
}

export async function updateSellerNote(
  ownerId: number,
  orderId: number,
  sellerNote: string
) {
  const note = sellerNote.trim().slice(0, 2000);
  if (useMemory()) {
    const order = mem.getMemoryStore().orders.find((o) => o.id === orderId);
    if (!order) throw new Error("Order not found");
    mem.memGetStoreForOwner(order.storeId, ownerId);
    (order as { sellerNote: string }).sellerNote = note;
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
  const updated = await db
    .update(orders)
    .set({ sellerNote: note, updatedAt: new Date() })
    .where(eq(orders.id, orderId))
    .returning();
  return updated[0];
}
