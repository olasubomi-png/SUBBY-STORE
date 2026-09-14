import { computeDiscount, type CouponType } from "@/lib/coupons/math";

export type PublicPromotion = {
  code: string;
  type: "percentage" | "fixed";
  value: number;
  label: string;
  /** When set, only these product IDs are eligible */
  productIds?: number[];
};

export function displayPriceWithPromotion(
  priceKobo: number,
  promotions: PublicPromotion[],
  productId?: number
): {
  currentKobo: number;
  originalKobo: number;
  discountKobo: number;
  badge: string | null;
  code: string | null;
} {
  let best = {
    currentKobo: priceKobo,
    originalKobo: priceKobo,
    discountKobo: 0,
    badge: null as string | null,
    code: null as string | null,
  };
  for (const p of promotions) {
    if (
      p.productIds &&
      p.productIds.length > 0 &&
      productId != null &&
      !p.productIds.includes(productId)
    ) {
      continue;
    }
    // Product-scoped promo without productId context: skip unit display
    if (p.productIds && p.productIds.length > 0 && productId == null) {
      continue;
    }
    const { discountKobo, totalKobo } = computeDiscount({
      type: p.type as CouponType,
      value: p.value,
      eligibleSubtotalKobo: priceKobo,
      cartSubtotalKobo: priceKobo,
      minimumOrderAmountKobo: 0,
      maximumDiscountAmountKobo: null,
    });
    if (discountKobo > best.discountKobo) {
      best = {
        currentKobo: totalKobo,
        originalKobo: priceKobo,
        discountKobo,
        badge: p.label,
        code: p.code,
      };
    }
  }
  return best;
}
