"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatNgn } from "@/lib/money";
import { readWishlist, writeWishlist } from "@/lib/storefront/wishlist-client";
import {
  clampCartToStock,
  readCart,
  writeCart,
  type CartLine,
} from "@/lib/storefront/cart-client";

type CatalogProduct = {
  id: number;
  name: string;
  slug: string;
  priceKobo: number;
  stock: number;
  imageUrl: string | null;
  active?: boolean;
};

export default function WishlistPage() {
  const params = useParams();
  const slug = String(params.slug);
  const [ids, setIds] = useState<number[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setIds(readWishlist(slug));
    (async () => {
      try {
        const res = await fetch(`/api/public/store/${encodeURIComponent(slug)}`);
        if (res.ok) {
          const data = await res.json();
          setCatalog(Array.isArray(data.products) ? data.products : []);
        }
      } catch {
        /* optional */
      } finally {
        setLoaded(true);
      }
    })();
  }, [slug]);

  const items = useMemo(() => {
    return ids
      .map((id) => catalog.find((p) => p.id === id))
      .filter(Boolean) as CatalogProduct[];
  }, [ids, catalog]);

  function remove(id: number) {
    const next = ids.filter((x) => x !== id);
    setIds(next);
    writeWishlist(slug, next);
  }

  function addToCart(p: CatalogProduct) {
    if (p.stock <= 0) return;
    const cart = readCart(slug);
    const existing = cart.find((l) => l.productId === p.id);
    let next: CartLine[];
    if (existing) {
      next = cart.map((l) =>
        l.productId === p.id
          ? { ...l, quantity: Math.min(p.stock, l.quantity + 1) }
          : l
      );
    } else {
      next = [...cart, { productId: p.id, quantity: 1 }];
    }
    writeCart(slug, clampCartToStock(next, catalog));
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <Link href={`/store/${slug}`} className="text-sm font-medium text-brand-700">
        ← Continue shopping
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-ink-950">Wishlist</h1>
      {!loaded ? (
        <p className="mt-6 text-sm text-ink-500">Loading…</p>
      ) : items.length === 0 ? (
        <div className="mt-8 rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-4 py-10 text-center">
          <p className="text-sm font-medium text-ink-800">Your wishlist is empty</p>
          <Link
            href={`/store/${slug}`}
            className="mt-3 inline-block text-sm font-medium text-brand-700"
          >
            Browse products
          </Link>
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {items.map((p) => (
            <li
              key={p.id}
              className="flex gap-3 rounded-xl border border-ink-100 bg-white p-3"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-50">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
                ) : null}
              </div>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/store/${slug}/product/${p.slug}`}
                  className="text-sm font-medium text-ink-900"
                >
                  {p.name}
                </Link>
                <p className="text-sm tabular-nums text-ink-700">
                  {formatNgn(p.priceKobo)}
                </p>
                <div className="mt-2 flex gap-3">
                  <button
                    type="button"
                    disabled={p.stock <= 0}
                    onClick={() => addToCart(p)}
                    className="text-xs font-medium text-brand-700 disabled:text-ink-300"
                  >
                    Add to cart
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(p.id)}
                    className="text-xs text-ink-500"
                  >
                    Remove
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
