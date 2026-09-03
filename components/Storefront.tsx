"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  StorefrontHeader,
  type StorefrontHeaderProps,
} from "@/components/StorefrontHeader";
import { ProductCard } from "@/components/ProductCard";
import {
  deriveCategories,
  discoverProducts,
  type DiscoveryProduct,
  type SortOption,
} from "@/lib/storefront/discovery";

export type PublicProduct = DiscoveryProduct;

export type PublicStore = StorefrontHeaderProps & {
  slug: string;
};

type CartLine = { productId: number; quantity: number };

function cartKey(slug: string) {
  return `subby_cart_${slug}`;
}

const SORT_OPTIONS: { value: SortOption; label: string }[] = [
  { value: "featured", label: "Featured" },
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name_asc", label: "Name: A–Z" },
];

export function Storefront({
  store,
  products,
}: {
  store: PublicStore;
  products: PublicProduct[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [sort, setSort] = useState<SortOption>("featured");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey(store.slug));
      if (raw) setCart(JSON.parse(raw));
    } catch {
      /* ignore */
    }
  }, [store.slug]);

  useEffect(() => {
    localStorage.setItem(cartKey(store.slug), JSON.stringify(cart));
  }, [cart, store.slug]);

  const count = useMemo(
    () => cart.reduce((s, l) => s + l.quantity, 0),
    [cart]
  );

  const categories = useMemo(() => deriveCategories(products), [products]);

  const visible = useMemo(
    () =>
      discoverProducts(products, {
        query,
        category: category === "All" ? null : category,
        sort,
      }),
    [products, query, category, sort]
  );

  function add(productId: number) {
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === productId);
      if (existing) {
        return prev.map((l) =>
          l.productId === productId
            ? { ...l, quantity: l.quantity + 1 }
            : l
        );
      }
      return [...prev, { productId, quantity: 1 }];
    });
  }

  return (
    <div className="min-h-screen bg-ink-50 pb-20">
      <StorefrontHeader {...store} />

      <div className="sticky top-0 z-10 border-b border-ink-100 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-3xl space-y-3 px-4 py-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink-700">Products</p>
            <Link
              href={`/store/${store.slug}/cart`}
              className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-medium text-ink-800"
            >
              Cart ({count})
            </Link>
          </div>

          <div className="relative">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products…"
              className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 pr-16 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              aria-label="Search products"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-ink-500 hover:text-ink-800"
              >
                Clear
              </button>
            ) : null}
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setCategory("All")}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                category === "All"
                  ? "bg-brand-600 text-white"
                  : "bg-ink-100 text-ink-700 hover:bg-ink-200"
              }`}
            >
              All
            </button>
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition ${
                  category === c
                    ? "bg-brand-600 text-white"
                    : "bg-ink-100 text-ink-700 hover:bg-ink-200"
                }`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-ink-500">
              Sort
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="rounded-md border border-ink-200 bg-white px-2 py-1 text-xs text-ink-800"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs text-ink-400">
              {visible.length} product{visible.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </div>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {products.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-500">
            No products available right now.
          </p>
        ) : visible.length === 0 ? (
          <div className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center">
            <p className="text-sm font-medium text-ink-800">No matches</p>
            <p className="mt-1 text-sm text-ink-500">
              Try a different search or category.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("All");
              }}
              className="mt-3 text-sm font-medium text-brand-700"
            >
              Reset filters
            </button>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {visible.map((p) => (
              <ProductCard
                key={p.id}
                product={p}
                storeSlug={store.slug}
                onAdd={add}
              />
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
