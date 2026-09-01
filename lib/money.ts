/** Integer-safe NGN money helpers. 1 NGN = 100 kobo. */

export const KOBO_PER_NGN = 100 as const;

export function assertPositiveKobo(kobo: number): void {
  if (!Number.isSafeInteger(kobo) || kobo <= 0) {
    throw new Error("Amount must be a positive integer (kobo)");
  }
}

export function assertNonNegativeKobo(kobo: number): void {
  if (!Number.isSafeInteger(kobo) || kobo < 0) {
    throw new Error("Amount must be a non-negative integer (kobo)");
  }
}

/** NGN major (e.g. 25.50) → kobo. Ceils residual fractional kobo. */
export function ngnMajorToKobo(major: number): number {
  if (!Number.isFinite(major) || major < 0) {
    throw new Error("Invalid NGN amount");
  }
  const kobo = Math.ceil(major * KOBO_PER_NGN - 1e-9);
  if (!Number.isSafeInteger(kobo)) throw new Error("Amount overflow");
  return kobo;
}

export function koboToNgnMajor(kobo: number): number {
  assertNonNegativeKobo(kobo);
  return kobo / KOBO_PER_NGN;
}

export function formatNgn(kobo: number): string {
  assertNonNegativeKobo(kobo);
  const major = kobo / KOBO_PER_NGN;
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(major);
}

export function lineTotalKobo(unitPriceKobo: number, quantity: number): number {
  assertPositiveKobo(unitPriceKobo);
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be a positive integer");
  }
  const total = unitPriceKobo * quantity;
  if (!Number.isSafeInteger(total)) throw new Error("Line total overflow");
  return total;
}

export function sumKobo(amounts: number[]): number {
  let sum = 0;
  for (const a of amounts) {
    assertNonNegativeKobo(a);
    sum += a;
    if (!Number.isSafeInteger(sum)) throw new Error("Sum overflow");
  }
  return sum;
}
