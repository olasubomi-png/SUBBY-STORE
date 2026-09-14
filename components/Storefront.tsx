"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  readWishlist,
  toggleWishlistId,
} from "@/lib/storefront/wishlist-client";
import { trackStoreEvent } from "@/lib/storefront/events-client";
import { shareOrCopy } from "@/lib/storefront/share";
import {
  displayPriceWithPromotion,
  type PublicPromotion,
} from "@/lib/storefront/promotions-display";

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
  promotions = [],
}: {
  store: PublicStore;
  products: PublicProduct[];
  promotions?: PublicPromotion[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [wishlist, setWishlist] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [sort, setSort] = useState<SortOption>("featured");
  const [shareMsg, setShareMsg] = useState("");

  const viewTracked = useRef<string | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(cartKey(store.slug));
      if (raw) setCart(JSON.parse(raw));
    } catch {
      /* ignore */
    }
    setWishlist(readWishlist(store.slug));
    if (viewTracked.current === store.slug) return;
    viewTracked.current = store.slug;
    void trackStoreEvent({ storeSlug: store.slug, eventType: "store_view" });
  }, [store.slug]);

  useEffect(() => {
    localStorage.setItem(cartKey(store.slug), JSON.stringify(cart));
  }, [cart, store.slug]);

  const count = useMemo(
    () => cart.reduce((s, l) => s + l.quantity, 0),
    [cart]
  );

  const categories = useMemo(() => deriveCategories(products), [products]);

  const featured = useMemo(
    () => products.filter((p) => p.featured),
    [products]
  );

  const visible = useMemo(
    () =>
      discoverProducts(products, {
        query,
        category: category === "All" ? null : category,
        sort,
      }),
    [products, query, category, sort]
  );

  function priceDisplay(p: DiscoveryProduct) {
    return displayPriceWithPromotion(p.priceKobo, promotions, p.id);
  }

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
    void trackStoreEvent({
      storeSlug: store.slug,
      eventType: "add_to_cart",
      productId,
    });
  }

  function toggleWish(productId: number) {
    const next = toggleWishlistId(store.slug, productId);
    setWishlist(next);
    void trackStoreEvent({
      storeSlug: store.slug,
      eventType: next.includes(productId)
        ? "wishlist_added"
        : "wishlist_removed",
      productId,
    });
  }

  async function shareStore() {
    const url =
      typeof window !== "undefined"
        ? window.location.href
        : `/store/${store.slug}`;
    const result = await shareOrCopy({
      title: store.name,
      text: store.description || `Shop ${store.name}`,
      url,
    });
    setShareMsg(
      result === "shared"
        ? "Shared"
        : result === "copied"
          ? "Link copied"
          : "Could not share"
    );
    void trackStoreEvent({ storeSlug: store.slug, eventType: "share_store" });
    setTimeout(() => setShareMsg(""), 2500);
  }

  return (
    <div className="mx-auto min-h-screen max-w-5xl px-3 pb-24 sm:px-4">
      <StorefrontHeader {...store} />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/store/${store.slug}/cart`}
          className="rounded-full bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white"
        >
          Cart ({count})
        </Link>
        <Link
          href={`/store/${store.slug}/wishlist`}
          className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700"
        >
          Wishlist ({wishlist.length})
        </Link>
        <Link
          href={`/store/${store.slug}/track`}
          className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700"
        >
          Track order
        </Link>
        <button
          type="button"
          onClick={() => void shareStore()}
          className="rounded-full border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700"
        >
          Share store
        </button>
        {shareMsg ? (
          <span className="text-xs text-brand-700">{shareMsg}</span>
        ) : null}
      </div>

      {promotions.length > 0 ? (
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {promotions.map((p) => (
            <span
              key={p.code}
              className="shrink-0 rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200"
            >
              {p.label} · use {p.code}
            </span>
          ))}
        </div>
      ) : null}

      {featured.length > 0 ? (
        <section className="mt-6">
          <h2 className="text-lg font-semibold text-ink-950">Featured</h2>
          <ul className="mt-3 flex gap-3 overflow-x-auto pb-2 sm:grid sm:grid-cols-3 sm:overflow-visible">
            {featured.map((p) => (
              <div key={p.id} className="w-56 shrink-0 sm:w-auto">
                <ProductCard
                  product={p}
                  storeSlug={store.slug}
                  onAdd={add}
                  wishlisted={wishlist.includes(p.id)}
                  onToggleWishlist={toggleWish}
                  display={priceDisplay(p)}
                />
              </div>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mt-6 space-y-3">
        <div className="relative">
          <label className="sr-only" htmlFor="store-search">
            Search products
          </label>
          <input
            id="store-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, description, category…"
            className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-3 pr-20 text-sm"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-xs font-medium text-ink-500"
            >
              Clear
            </button>
          ) : null}
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          {["All", ...categories].map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                category === c
                  ? "bg-ink-900 text-white"
                  : "bg-ink-100 text-ink-600"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-ink-500">
            {visible.length} result{visible.length === 1 ? "" : "s"}
            {query ? ` for “${query}”` : ""}
          </p>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-xs"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {visible.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-4 py-10 text-center">
            <p className="text-sm font-medium text-ink-800">No products found</p>
            <p className="mt-1 text-xs text-ink-500">
              Try another search or clear filters.
            </p>
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setCategory("All");
              }}
              className="mt-3 text-sm font-medium text-brand-700"
            >
              Clear search & filters
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
                wishlisted={wishlist.includes(p.id)}
                onToggleWishlist={toggleWish}
                display={priceDisplay(p)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
