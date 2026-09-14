import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { coupons, couponProducts } from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import type { PublicPromotion } from "@/lib/storefront/promotions-display";

export type { PublicPromotion };

function isCurrentlyValid(c: {
  active: boolean;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
}): boolean {
  if (!c.active) return false;
  const now = new Date();
  if (c.startsAt && now < c.startsAt) return false;
  if (c.expiresAt && now > c.expiresAt) return false;
  if (c.usageLimit != null && c.usageCount >= c.usageLimit) return false;
  return true;
}

function labelFor(type: string, value: number): string {
  if (type === "percentage") return `${value}% OFF`;
  const naira = Math.round(value / 100);
  return `₦${naira.toLocaleString("en-NG")} OFF`;
}

/**
 * Public promotions for storefront display.
 * Only currently valid, active coupons.
 * Product-scoped coupons include productIds so cards can filter eligibility.
 * Minimum-order coupons are still listed (label only) but display-price
 * helpers apply them only when cart context is available at checkout.
 */
export async function listPublicStorePromotions(
  storeId: number
): Promise<PublicPromotion[]> {
  let rows: Array<{
    id: number;
    code: string;
    type: string;
    value: number;
    active: boolean;
    startsAt: Date | null;
    expiresAt: Date | null;
    usageLimit: number | null;
    usageCount: number;
    minimumOrderAmount: number;
  }> = [];

  if (useMemory()) {
    rows = mem.getMemoryStore().coupons.filter((c) => c.storeId === storeId);
  } else {
    const db = getDb();
    rows = await db.select().from(coupons).where(eq(coupons.storeId, storeId));
  }

  const result: PublicPromotion[] = [];
  for (const c of rows) {
    if (!isCurrentlyValid(c)) continue;
    if (c.type !== "percentage" && c.type !== "fixed") continue;

    let productIds: number[] = [];
    if (useMemory()) {
      productIds = mem
        .getMemoryStore()
        .couponProducts.filter((l) => l.couponId === c.id)
        .map((l) => l.productId);
    } else {
      const db = getDb();
      const links = await db
        .select()
        .from(couponProducts)
        .where(eq(couponProducts.couponId, c.id));
      productIds = links.map((l) => l.productId);
    }

    // Skip coupons that require a minimum order for unit-price card display
    // (they remain valid at checkout via validateCouponForCart).
    if (c.minimumOrderAmount > 0) continue;

    result.push({
      code: c.code,
      type: c.type as "percentage" | "fixed",
      value: c.value,
      label: labelFor(c.type, c.value),
      productIds: productIds.length > 0 ? productIds : undefined,
    });
  }
  return result.slice(0, 8);
}
