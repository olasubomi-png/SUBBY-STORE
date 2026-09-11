/** Shared coupon field validation (create + final PATCH state). */

export type CouponType = "percentage" | "fixed";

export function assertCouponValue(type: string, value: number): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error("Invalid discount value");
  }
  if (type === "percentage") {
    if (value < 1 || value > 100) {
      throw new Error("Percentage must be between 1 and 100");
    }
  } else if (type === "fixed") {
    // value is in kobo for stored state
    if (value <= 0) throw new Error("Fixed discount must be positive");
  } else {
    throw new Error("Invalid coupon type");
  }
}

export function assertCouponDates(
  startsAt: Date | null | undefined,
  expiresAt: Date | null | undefined
): void {
  if (startsAt != null && !(startsAt instanceof Date && !Number.isNaN(startsAt.getTime()))) {
    throw new Error("Invalid start date");
  }
  if (expiresAt != null && !(expiresAt instanceof Date && !Number.isNaN(expiresAt.getTime()))) {
    throw new Error("Invalid expiry date");
  }
  if (startsAt && expiresAt && expiresAt.getTime() <= startsAt.getTime()) {
    throw new Error("Expiry must be after the start date");
  }
}

export function assertOptionalPositiveInt(
  label: string,
  value: number | null | undefined
): void {
  if (value == null) return;
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Invalid ${label}`);
  }
}
