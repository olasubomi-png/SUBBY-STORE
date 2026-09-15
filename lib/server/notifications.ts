/**
 * Seller in-dashboard notifications.
 * Creation is server-side only and non-blocking for checkout/payment paths.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { notifications, stores, coupons } from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import { formatNgn } from "@/lib/money";

export type NotificationType =
  | "order_created"
  | "payment_confirmed"
  | "payment_failed"
  | "low_stock"
  | "out_of_stock"
  | "coupon_expiring"
  | "campaign_scheduled"
  | "campaign_started"
  | "campaign_expired"
  | "wallet_earning"
  | "withdrawal_requested"
  | "withdrawal_succeeded"
  | "withdrawal_failed"
  | "withdrawal_reversed"
  | "wallet_debt";

export type NotificationRow = {
  id: number;
  storeId: number;
  type: string;
  title: string;
  message: string;
  relatedOrderId: number | null;
  relatedProductId: number | null;
  relatedCouponId: number | null;
  href: string | null;
  read: boolean;
  dedupeKey: string | null;
  createdAt: Date;
};

async function ownerStoreIds(ownerId: number): Promise<number[]> {
  if (useMemory()) {
    return mem
      .getMemoryStore()
      .stores.filter((s) => s.ownerId === ownerId)
      .map((s) => s.id);
  }
  const db = getDb();
  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, ownerId));
  return rows.map((r) => r.id);
}

/**
 * Insert notification with dedupe. Never throws for unique conflicts.
 * Returns null if duplicate or soft-failed.
 */
export async function createNotification(input: {
  storeId: number;
  type: NotificationType;
  title: string;
  message: string;
  relatedOrderId?: number | null;
  relatedProductId?: number | null;
  relatedCouponId?: number | null;
  href?: string | null;
  dedupeKey: string;
}): Promise<NotificationRow | null> {
  try {
    if (useMemory()) {
      return mem.memCreateNotification(input);
    }
    const db = getDb();
    try {
      const rows = await db
        .insert(notifications)
        .values({
          storeId: input.storeId,
          type: input.type,
          title: input.title.slice(0, 160),
          message: input.message,
          relatedOrderId: input.relatedOrderId ?? null,
          relatedProductId: input.relatedProductId ?? null,
          relatedCouponId: input.relatedCouponId ?? null,
          href: input.href ?? null,
          read: false,
          dedupeKey: input.dedupeKey.slice(0, 160),
        })
        .returning();
      return rows[0] ?? null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/unique|duplicate/i.test(msg)) return null;
      throw err;
    }
  } catch (err) {
    console.error("[notifications] create failed", err);
    return null;
  }
}

export async function notifyOrderCreated(order: {
  id: number;
  storeId: number;
  customerName: string;
  totalKobo: number;
}): Promise<void> {
  await createNotification({
    storeId: order.storeId,
    type: "order_created",
    title: "New order",
    message: `${order.customerName} placed an order for ${formatNgn(order.totalKobo)}.`,
    relatedOrderId: order.id,
    href: "/dashboard/orders",
    dedupeKey: `order_created:${order.id}`,
  });
}

export async function notifyPaymentConfirmed(order: {
  id: number;
  storeId: number;
  customerName: string;
  totalKobo: number;
}): Promise<void> {
  await createNotification({
    storeId: order.storeId,
    type: "payment_confirmed",
    title: "Payment confirmed",
    message: `Payment of ${formatNgn(order.totalKobo)} from ${order.customerName} was confirmed.`,
    relatedOrderId: order.id,
    href: "/dashboard/orders",
    dedupeKey: `payment_confirmed:${order.id}`,
  });
}

export async function notifyPaymentFailed(input: {
  storeId: number;
  reference: string;
  reason?: string;
  orderId?: number;
}): Promise<void> {
  await createNotification({
    storeId: input.storeId,
    type: "payment_failed",
    title: "Payment issue",
    message:
      input.reason ||
      `Payment could not be confirmed for reference ${input.reference}.`,
    relatedOrderId: input.orderId ?? null,
    href: "/dashboard/orders",
    dedupeKey: `payment_failed:${input.reference}`,
  });
}

export async function notifyStockLevel(input: {
  storeId: number;
  productId: number;
  productName: string;
  stock: number;
}): Promise<void> {
  if (input.stock <= 0) {
    await createNotification({
      storeId: input.storeId,
      type: "out_of_stock",
      title: "Out of stock",
      message: `${input.productName} is out of stock.`,
      relatedProductId: input.productId,
      href: "/dashboard/inventory",
      dedupeKey: `out_of_stock:${input.productId}`,
    });
    return;
  }
  // Low stock — one notification per product while still low
  const { LOW_STOCK_THRESHOLD } = await import("@/lib/inventory");
  if (input.stock <= LOW_STOCK_THRESHOLD) {
    await createNotification({
      storeId: input.storeId,
      type: "low_stock",
      title: "Low stock",
      message: `${input.productName} has only ${input.stock} left.`,
      relatedProductId: input.productId,
      href: "/dashboard/inventory",
      dedupeKey: `low_stock:${input.productId}`,
    });
  }
}

/** Scan active coupons expiring within N days and notify once per coupon. */
export async function notifyExpiringCoupons(
  storeIds: number[],
  withinDays = 3
): Promise<void> {
  if (storeIds.length === 0) return;
  const now = new Date();
  const until = new Date(now.getTime() + withinDays * 24 * 60 * 60 * 1000);

  let rows: Array<{
    id: number;
    storeId: number;
    code: string;
    expiresAt: Date | null;
    active: boolean;
  }> = [];

  if (useMemory()) {
    rows = mem
      .getMemoryStore()
      .coupons.filter(
        (c) =>
          storeIds.includes(c.storeId) &&
          c.active &&
          c.expiresAt &&
          c.expiresAt >= now &&
          c.expiresAt <= until
      );
  } else {
    const db = getDb();
    const all = await db
      .select()
      .from(coupons)
      .where(inArray(coupons.storeId, storeIds));
    rows = all.filter(
      (c) =>
        c.active &&
        c.expiresAt &&
        c.expiresAt >= now &&
        c.expiresAt <= until
    );
  }

  for (const c of rows) {
    if (!c.expiresAt) continue;
    const dayKey = c.expiresAt.toISOString().slice(0, 10);
    await createNotification({
      storeId: c.storeId,
      type: "coupon_expiring",
      title: "Coupon expiring soon",
      message: `Coupon ${c.code} expires on ${dayKey}.`,
      relatedCouponId: c.id,
      href: "/dashboard/coupons",
      dedupeKey: `coupon_expiring:${c.id}:${dayKey}`,
    });
  }
}

export async function listNotificationsForOwner(
  ownerId: number,
  opts: { limit?: number; offset?: number; unreadOnly?: boolean } = {}
): Promise<{ notifications: NotificationRow[]; unreadCount: number }> {
  const storeIds = await ownerStoreIds(ownerId);
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const offset = Math.max(opts.offset ?? 0, 0);

  // Best-effort coupon expiry scan (deduped)
  try {
    await notifyExpiringCoupons(storeIds);
  } catch {
    /* non-blocking */
  }

  if (storeIds.length === 0) {
    return { notifications: [], unreadCount: 0 };
  }

  if (useMemory()) {
    let list = mem
      .getMemoryStore()
      .notifications.filter((n) => storeIds.includes(n.storeId));
    const unreadCount = list.filter((n) => !n.read).length;
    if (opts.unreadOnly) list = list.filter((n) => !n.read);
    list = [...list].sort(
      (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
    );
    return {
      notifications: list.slice(offset, offset + limit),
      unreadCount,
    };
  }

  const db = getDb();
  const conditions = [inArray(notifications.storeId, storeIds)];
  if (opts.unreadOnly) conditions.push(eq(notifications.read, false));

  const rows = await db
    .select()
    .from(notifications)
    .where(and(...conditions))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset);

  const countRows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(notifications)
    .where(
      and(
        inArray(notifications.storeId, storeIds),
        eq(notifications.read, false)
      )
    );

  return {
    notifications: rows,
    unreadCount: Number(countRows[0]?.c || 0),
  };
}

export async function markNotificationRead(
  ownerId: number,
  notificationId: number
): Promise<boolean> {
  const storeIds = await ownerStoreIds(ownerId);
  if (storeIds.length === 0) return false;

  if (useMemory()) {
    const n = mem
      .getMemoryStore()
      .notifications.find(
        (x) => x.id === notificationId && storeIds.includes(x.storeId)
      );
    if (!n) return false;
    n.read = true;
    return true;
  }

  const db = getDb();
  const updated = await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        eq(notifications.id, notificationId),
        inArray(notifications.storeId, storeIds)
      )
    )
    .returning();
  return updated.length > 0;
}

export async function markAllNotificationsRead(
  ownerId: number
): Promise<number> {
  const storeIds = await ownerStoreIds(ownerId);
  if (storeIds.length === 0) return 0;

  if (useMemory()) {
    let n = 0;
    for (const row of mem.getMemoryStore().notifications) {
      if (storeIds.includes(row.storeId) && !row.read) {
        row.read = true;
        n += 1;
      }
    }
    return n;
  }

  const db = getDb();
  const updated = await db
    .update(notifications)
    .set({ read: true })
    .where(
      and(
        inArray(notifications.storeId, storeIds),
        eq(notifications.read, false)
      )
    )
    .returning();
  return updated.length;
}

export async function dismissNotification(
  ownerId: number,
  notificationId: number
): Promise<boolean> {
  const storeIds = await ownerStoreIds(ownerId);
  if (storeIds.length === 0) return false;

  if (useMemory()) {
    const store = mem.getMemoryStore();
    const idx = store.notifications.findIndex(
      (x) => x.id === notificationId && storeIds.includes(x.storeId)
    );
    if (idx < 0) return false;
    store.notifications.splice(idx, 1);
    return true;
  }

  const db = getDb();
  const deleted = await db
    .delete(notifications)
    .where(
      and(
        eq(notifications.id, notificationId),
        inArray(notifications.storeId, storeIds)
      )
    )
    .returning();
  return deleted.length > 0;
}


/** Idempotent wallet notifications (dedupeKey prevents webhook/recon spam). */
export async function notifyWalletEarning(input: {
  storeId: number;
  orderId: number;
  amountKobo: number;
}) {
  await createNotification({
    storeId: input.storeId,
    type: "wallet_earning",
    title: "Earning credited",
    message: `${formatNgn(input.amountKobo)} from order #${input.orderId} was added to your wallet.`,
    relatedOrderId: input.orderId,
    href: "/dashboard/wallet",
    dedupeKey: `wallet_earning:${input.orderId}`,
  });
}

export async function notifyWithdrawalRequested(input: {
  storeId: number;
  reference: string;
  amountKobo: number;
}) {
  await createNotification({
    storeId: input.storeId,
    type: "withdrawal_requested",
    title: "Withdrawal requested",
    message: `${formatNgn(input.amountKobo)} withdrawal is processing.`,
    href: "/dashboard/wallet/withdrawals",
    dedupeKey: `withdrawal_requested:${input.reference}`,
  });
}

export async function notifyWithdrawalSucceeded(input: {
  storeId: number;
  reference: string;
  amountKobo: number;
}) {
  await createNotification({
    storeId: input.storeId,
    type: "withdrawal_succeeded",
    title: "Withdrawal successful",
    message: `${formatNgn(input.amountKobo)} was sent to your bank account.`,
    href: "/dashboard/wallet/withdrawals",
    dedupeKey: `withdrawal_succeeded:${input.reference}`,
  });
}

export async function notifyWithdrawalFailed(input: {
  storeId: number;
  reference: string;
  amountKobo: number;
}) {
  await createNotification({
    storeId: input.storeId,
    type: "withdrawal_failed",
    title: "Withdrawal failed",
    message: `${formatNgn(input.amountKobo)} withdrawal failed. Your balance has been restored.`,
    href: "/dashboard/wallet/withdrawals",
    dedupeKey: `withdrawal_failed:${input.reference}`,
  });
}

export async function notifyWithdrawalReversed(input: {
  storeId: number;
  reference: string;
  amountKobo: number;
}) {
  await createNotification({
    storeId: input.storeId,
    type: "withdrawal_reversed",
    title: "Withdrawal reversed",
    message: `${formatNgn(input.amountKobo)} was returned to your wallet.`,
    href: "/dashboard/wallet/withdrawals",
    dedupeKey: `withdrawal_reversed:${input.reference}`,
  });
}

export async function notifyWalletDebt(input: {
  storeId: number;
  orderId: number;
  amountKobo: number;
}) {
  await createNotification({
    storeId: input.storeId,
    type: "wallet_debt",
    title: "Outstanding wallet balance",
    message: `A refund created ${formatNgn(input.amountKobo)} outstanding debt. Withdrawals are paused until recovered.`,
    relatedOrderId: input.orderId,
    href: "/dashboard/wallet",
    dedupeKey: `wallet_debt:${input.orderId}`,
  });
}
