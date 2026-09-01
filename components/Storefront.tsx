"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatNgn } from "@/lib/money";

export type PublicProduct = {
  id: number;
  name: string;
  slug: string;
  description: string;
  priceKobo: number;
  stock: number;
  imageUrl: string | null;
};

export type PublicStore = {
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
};

type CartLine = { productId: number; quantity: number };

function cartKey(slug: string) {
  return `subby_cart_${slug}`;
}

export function Storefront({
  store,
  products,
}: {
  store: PublicStore;
  products: PublicProduct[];
}) {
  const [cart, setCart] = useState<CartLine[]>([]);

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
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold text-ink-950">
              {store.name}
            </h1>
            {store.description && (
              <p className="mt-0.5 line-clamp-2 text-sm text-ink-500">
                {store.description}
              </p>
            )}
          </div>
          <Link
            href={`/store/${store.slug}/cart`}
            className="shrink-0 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800"
          >
            Cart ({count})
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        {products.length === 0 ? (
          <p className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-500">
            No products available right now.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {products.map((p) => (
              <li
                key={p.id}
                className="flex flex-col overflow-hidden rounded-xl border border-ink-100 bg-white"
              >
                <div className="aspect-square bg-ink-100">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-xs text-ink-400">
                      No image
                    </div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-3">
                  <Link
                    href={`/store/${store.slug}/product/${p.slug}`}
                    className="line-clamp-2 text-sm font-medium text-ink-900"
                  >
                    {p.name}
                  </Link>
                  <p className="mt-1 text-sm font-semibold tabular-nums text-ink-950">
                    {formatNgn(p.priceKobo)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {p.stock > 0 ? "In stock" : "Out of stock"}
                  </p>
                  <button
                    type="button"
                    disabled={p.stock <= 0}
                    onClick={() => add(p.id)}
                    className="mt-auto pt-3 text-left text-sm font-medium text-brand-700 disabled:text-ink-300"
                  >
                    Add to cart
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
