/** Stock reservation duration for pending checkouts. */
export const RESERVATION_TTL_MS = 15 * 60 * 1000;

export function reservationExpiryDate(from = new Date()): Date {
  return new Date(from.getTime() + RESERVATION_TTL_MS);
}

export function isReservationExpired(
  expiresAt: Date | string | null | undefined,
  now = new Date()
): boolean {
  if (!expiresAt) return false;
  const t =
    expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(String(expiresAt));
  if (!Number.isFinite(t)) return false;
  return t <= now.getTime();
}
