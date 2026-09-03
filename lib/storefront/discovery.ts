/** Pure storefront discovery helpers (search / category / sort / related). */

export type DiscoveryProduct = {
  id: number;
  name: string;
  slug: string;
  description: string;
  priceKobo: number;
  stock: number;
  imageUrl: string | null;
  category: string;
  featured: boolean;
  createdAt?: Date | string | null;
};

export type SortOption =
  | "featured"
  | "newest"
  | "price_asc"
  | "price_desc"
  | "name_asc";

export function normalizeQuery(q: string): string {
  return q.trim().toLowerCase();
}

export function deriveCategories(products: DiscoveryProduct[]): string[] {
  const set = new Set<string>();
  for (const p of products) {
    const c = (p.category || "General").trim();
    if (c) set.add(c);
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function filterProducts(
  products: DiscoveryProduct[],
  opts: { query?: string; category?: string | null }
): DiscoveryProduct[] {
  const q = normalizeQuery(opts.query || "");
  const category = opts.category?.trim() || null;

  return products.filter((p) => {
    if (category && category !== "All") {
      if ((p.category || "General").trim() !== category) return false;
    }
    if (!q) return true;
    const name = p.name.toLowerCase();
    const desc = (p.description || "").toLowerCase();
    return name.includes(q) || desc.includes(q);
  });
}

function createdAtMs(p: DiscoveryProduct): number {
  if (!p.createdAt) return 0;
  const t = p.createdAt instanceof Date ? p.createdAt.getTime() : Date.parse(String(p.createdAt));
  return Number.isFinite(t) ? t : 0;
}

export function sortProducts(
  products: DiscoveryProduct[],
  sort: SortOption
): DiscoveryProduct[] {
  const list = [...products];
  switch (sort) {
    case "newest":
      return list.sort((a, b) => createdAtMs(b) - createdAtMs(a));
    case "price_asc":
      return list.sort((a, b) => a.priceKobo - b.priceKobo);
    case "price_desc":
      return list.sort((a, b) => b.priceKobo - a.priceKobo);
    case "name_asc":
      return list.sort((a, b) => a.name.localeCompare(b.name));
    case "featured":
    default:
      return list.sort((a, b) => {
        if (a.featured !== b.featured) return a.featured ? -1 : 1;
        // in-stock before out-of-stock, then newest
        if ((a.stock > 0) !== (b.stock > 0)) return a.stock > 0 ? -1 : 1;
        return createdAtMs(b) - createdAtMs(a);
      });
  }
}

export function discoverProducts(
  products: DiscoveryProduct[],
  opts: {
    query?: string;
    category?: string | null;
    sort?: SortOption;
  }
): DiscoveryProduct[] {
  const filtered = filterProducts(products, opts);
  return sortProducts(filtered, opts.sort || "featured");
}

/** Related products: same category first, then others; active list assumed; prefer in-stock. */
export function relatedProducts(
  products: DiscoveryProduct[],
  current: DiscoveryProduct,
  limit = 4
): DiscoveryProduct[] {
  const others = products.filter((p) => p.id !== current.id);
  const same = others.filter(
    (p) =>
      (p.category || "General").trim() ===
      (current.category || "General").trim()
  );
  const rest = others.filter(
    (p) =>
      (p.category || "General").trim() !==
      (current.category || "General").trim()
  );

  const rank = (list: DiscoveryProduct[]) =>
    [...list].sort((a, b) => {
      if ((a.stock > 0) !== (b.stock > 0)) return a.stock > 0 ? -1 : 1;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return createdAtMs(b) - createdAtMs(a);
    });

  return [...rank(same), ...rank(rest)].slice(0, limit);
}
