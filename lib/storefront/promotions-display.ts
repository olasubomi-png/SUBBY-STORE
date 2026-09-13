import { computeDiscount, type CouponType } from "@/lib/coupons/math";

export type PublicPromotion = {
  code: string;
  type: "percentage" | "fixed";
  value: number;
  label: string;
};

export function displayPriceWithPromotion(
  priceKobo: number,
  promotions: PublicPromotion[]
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
