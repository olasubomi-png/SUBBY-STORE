import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { orderItems, orders, stores } from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import {
  analyticsPeriodBounds,
  computeSellerAnalyticsFromData,
  type SellerAnalytics,
} from "@/lib/analytics-math";

export {
  ANALYTICS_PERIODS,
  resolveAnalyticsPeriod,
  computeSellerAnalyticsFromData,
  analyticsPeriodBounds,
  percentChange,
  safeRate,
  type SellerAnalytics,
  type AnalyticsPeriodDays,
} from "@/lib/analytics-math";

export async function getSellerAnalytics(
  ownerId: number,
  periodDays: number = 30
): Promise<SellerAnalytics> {
  if (useMemory()) {
    return mem.memGetSellerAnalytics(ownerId, periodDays);
  }

  const db = getDb();
  const storeRows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, ownerId));
  const storeIds = storeRows.map((r) => r.id);

  const bounds = analyticsPeriodBounds(periodDays);
  const windowStart = bounds.prevStart;

  if (storeIds.length === 0) {
    return computeSellerAnalyticsFromData(periodDays, [], []);
  }

  const storeFilter = sql`${orders.storeId} IN (${sql.join(
    storeIds.map((id) => sql`${id}`),
    sql`, `
  )})`;

  const orderRows = await db
    .select({
      id: orders.id,
      storeId: orders.storeId,
      totalKobo: orders.totalKobo,
      paymentStatus: orders.paymentStatus,
      orderStatus: orders.orderStatus,
      createdAt: orders.createdAt,
    })
    .from(orders)
    .where(and(storeFilter, gte(orders.createdAt, windowStart)));

  const orderIds = orderRows.map((o) => o.id);
  let itemRows: Array<{
    orderId: number;
    productId: number | null;
    productNameSnapshot: string;
    quantity: number;
    lineTotalKobo: number;
  }> = [];

  if (orderIds.length > 0) {
    const itemFilter = sql`${orderItems.orderId} IN (${sql.join(
      orderIds.map((id) => sql`${id}`),
      sql`, `
    )})`;
    itemRows = await db
      .select({
        orderId: orderItems.orderId,
        productId: orderItems.productId,
        productNameSnapshot: orderItems.productNameSnapshot,
        quantity: orderItems.quantity,
        lineTotalKobo: orderItems.lineTotalKobo,
      })
      .from(orderItems)
      .where(itemFilter);
  }

  return computeSellerAnalyticsFromData(periodDays, orderRows, itemRows);
}
