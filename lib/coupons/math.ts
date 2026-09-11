/** Pure coupon discount math (integer kobo only). */

export type CouponType = "percentage" | "fixed";

export type DiscountInput = {
  type: CouponType;
  /** percentage: 1–100; fixed: kobo */
  value: number;
  /** Eligible cart lines subtotal in kobo */
  eligibleSubtotalKobo: number;
  /** Full cart subtotal in kobo (for minimum check) */
  cartSubtotalKobo: number;
  minimumOrderAmountKobo: number;
  maximumDiscountAmountKobo: number | null;
};

export type DiscountResult = {
  discountKobo: number;
  totalKobo: number;
};

export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Compute discount against eligible subtotal; never exceeds cart subtotal;
 * never negative total.
 */
export function computeDiscount(input: DiscountInput): DiscountResult {
  const cart = Math.max(0, Math.floor(input.cartSubtotalKobo));
  const eligible = Math.max(0, Math.floor(input.eligibleSubtotalKobo));
  if (cart <= 0 || eligible <= 0) {
    return { discountKobo: 0, totalKobo: cart };
  }
  if (input.minimumOrderAmountKobo > 0 && cart < input.minimumOrderAmountKobo) {
    return { discountKobo: 0, totalKobo: cart };
  }

  let discount = 0;
  if (input.type === "percentage") {
    const pct = Math.min(100, Math.max(0, Math.floor(input.value)));
    discount = Math.floor((eligible * pct) / 100);
    if (
      input.maximumDiscountAmountKobo != null &&
      input.maximumDiscountAmountKobo >= 0
    ) {
      discount = Math.min(discount, Math.floor(input.maximumDiscountAmountKobo));
    }
  } else {
    discount = Math.max(0, Math.floor(input.value));
  }

  // Never exceed eligible or full cart
  discount = Math.min(discount, eligible, cart);
  return { discountKobo: discount, totalKobo: cart - discount };
}
