/**
 * Seller conversion metrics from store_events + paid orders.
 * Always scoped to stores owned by the authenticated seller.
 */
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { storeEvents, stores } from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import { analyticsPeriodBounds } from "@/lib/analytics-math";

export type ConversionMetrics = {
  storeViews: number;
  productViews: number;
  addToCart: number;
  checkoutStarts: number;
  purchases: number;
  wishlistAdds: number;
  shares: number;
  /** purchases / storeViews when storeViews > 0 */
  conversionRate: number | null;
  /** addToCart / productViews when productViews > 0 */
  productToCartRate: number | null;
  /** checkoutStarts / addToCart when addToCart > 0 */
  cartToCheckoutRate: number | null;
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

async function countEvents(
  storeIds: number[],
  eventType: string,
  since: Date
): Promise<number> {
  if (storeIds.length === 0) return 0;
  if (useMemory()) {
    return mem.memCountStoreEvents(storeIds, eventType, since);
  }
  const db = getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(storeEvents)
    .where(
      and(
        inArray(storeEvents.storeId, storeIds),
        eq(storeEvents.eventType, eventType),
        gte(storeEvents.createdAt, since)
      )
    );
  return Number(rows[0]?.c || 0);
}

export async function getConversionMetrics(
  ownerId: number,
  periodDays: number = 30
): Promise<ConversionMetrics> {
  const storeIds = await ownerStoreIds(ownerId);
  const bounds = analyticsPeriodBounds(periodDays);
  const since = bounds.start;

  const [
    storeViews,
    productViews,
    addToCart,
    checkoutStarts,
    purchases,
    wishlistAdds,
    shareProduct,
    shareStore,
  ] = await Promise.all([
    countEvents(storeIds, "store_view", since),
    countEvents(storeIds, "product_view", since),
    countEvents(storeIds, "add_to_cart", since),
    countEvents(storeIds, "checkout_started", since),
    countEvents(storeIds, "purchase_completed", since),
    countEvents(storeIds, "wishlist_added", since),
    countEvents(storeIds, "share_product", since),
    countEvents(storeIds, "share_store", since),
  ]);

  const shares = shareProduct + shareStore;
  const conversionRate =
    storeViews > 0 ? purchases / storeViews : null;
  const productToCartRate =
    productViews > 0 ? addToCart / productViews : null;
  const cartToCheckoutRate =
    addToCart > 0 ? checkoutStarts / addToCart : null;

  return {
    storeViews,
    productViews,
    addToCart,
    checkoutStarts,
    purchases,
    wishlistAdds,
    shares,
    conversionRate,
    productToCartRate,
    cartToCheckoutRate,
  };
}
