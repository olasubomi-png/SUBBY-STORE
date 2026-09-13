export function wishlistKey(storeSlug: string): string {
  return `subby_wishlist_${storeSlug}`;
}

export function readWishlist(storeSlug: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(wishlistKey(storeSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((id) => Number(id))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
  } catch {
    return [];
  }
}

export function writeWishlist(storeSlug: string, ids: number[]): void {
  if (typeof window === "undefined") return;
  const unique = [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
  localStorage.setItem(wishlistKey(storeSlug), JSON.stringify(unique));
}

export function toggleWishlistId(storeSlug: string, productId: number): number[] {
  const current = readWishlist(storeSlug);
  const next = current.includes(productId)
    ? current.filter((id) => id !== productId)
    : [...current, productId];
  writeWishlist(storeSlug, next);
  return next;
}

export function isWishlisted(storeSlug: string, productId: number): boolean {
  return readWishlist(storeSlug).includes(productId);
}
