/**
 * Client-side cart helpers. Prices are never trusted from the client —
 * server re-prices at checkout via priceCart.
 */

export type CartLine = { productId: number; quantity: number };

export function cartStorageKey(storeSlug: string): string {
  return `subby_cart_${storeSlug}`;
}

export function readCart(storeSlug: string): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(cartStorageKey(storeSlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return sanitizeCartLines(parsed);
  } catch {
    return [];
  }
}

export function writeCart(storeSlug: string, lines: CartLine[]): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(cartStorageKey(storeSlug), JSON.stringify(sanitizeCartLines(lines)));
}

export function clearCart(storeSlug: string): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(cartStorageKey(storeSlug));
}

export function sanitizeCartLines(raw: unknown[]): CartLine[] {
  const map = new Map<number, number>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const productId = Number((item as CartLine).productId);
    const quantity = Number((item as CartLine).quantity);
    if (!Number.isSafeInteger(productId) || productId <= 0) continue;
    if (!Number.isSafeInteger(quantity) || quantity <= 0) continue;
    const prev = map.get(productId) ?? 0;
    map.set(productId, Math.min(100, prev + quantity));
  }
  return Array.from(map.entries()).map(([productId, quantity]) => ({
    productId,
    quantity,
  }));
}

/** Cap quantity by stock; drop lines with stock 0 or missing product. */
export function clampCartToStock(
  lines: CartLine[],
  products: Array<{ id: number; stock: number; active?: boolean }>
): CartLine[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: CartLine[] = [];
  for (const line of lines) {
    const p = byId.get(line.productId);
    if (!p) continue;
    if (p.active === false) continue;
    if (p.stock <= 0) continue;
    const qty = Math.min(Math.max(1, line.quantity), p.stock, 100);
    out.push({ productId: line.productId, quantity: qty });
  }
  return out;
}

export function addToCartLines(
  lines: CartLine[],
  productId: number,
  quantity: number,
  maxStock: number
): CartLine[] {
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    throw new Error("Invalid product");
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw new Error("Quantity must be at least 1");
  }
  if (maxStock <= 0) {
    throw new Error("Out of stock");
  }
  const next = sanitizeCartLines(lines);
  const existing = next.find((l) => l.productId === productId);
  if (existing) {
    const qty = Math.min(existing.quantity + quantity, maxStock, 100);
    return next.map((l) =>
      l.productId === productId ? { ...l, quantity: qty } : l
    );
  }
  return [...next, { productId, quantity: Math.min(quantity, maxStock, 100) }];
}

export function setCartLineQuantity(
  lines: CartLine[],
  productId: number,
  quantity: number,
  maxStock: number
): CartLine[] {
  if (quantity <= 0) {
    return lines.filter((l) => l.productId !== productId);
  }
  const qty = Math.min(quantity, Math.max(0, maxStock), 100);
  if (qty <= 0) return lines.filter((l) => l.productId !== productId);
  const exists = lines.some((l) => l.productId === productId);
  if (!exists) {
    return [...lines, { productId, quantity: qty }];
  }
  return lines.map((l) =>
    l.productId === productId ? { ...l, quantity: qty } : l
  );
}

export function clampQuantity(qty: number, stock: number): number {
  if (!Number.isSafeInteger(qty) || qty < 1) return 1;
  if (stock <= 0) return 1;
  return Math.min(qty, stock, 100);
}
