"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatNgn } from "@/lib/money";
import {
  clampCartToStock,
  readCart,
  setCartLineQuantity,
  writeCart,
  type CartLine,
} from "@/lib/storefront/cart-client";

type CatalogProduct = {
  id: number;
  name: string;
  slug: string;
  priceKobo: number;
  stock: number;
  imageUrl?: string | null;
  active?: boolean;
};

export default function CartPage() {
  const params = useParams();
  const slug = String(params.slug);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const local = readCart(slug);
      try {
        const res = await fetch(`/api/public/store/${slug}`, {
          cache: "no-store",
        });
        const data = await res.json();
        const products = (data.products || []) as CatalogProduct[];
        if (cancelled) return;
        setCatalog(products);
        const clamped = clampCartToStock(local, products);
        setCart(clamped);
        writeCart(slug, clamped);
      } catch {
        if (!cancelled) {
          setCart(local);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  function persist(next: CartLine[]) {
    const clamped = clampCartToStock(next, catalog);
    setCart(clamped);
    writeCart(slug, clamped);
  }

  const lines = useMemo(() => {
    return cart
      .map((c) => {
        const p = catalog.find((x) => x.id === c.productId);
        if (!p) return null;
        return {
          productId: c.productId,
          quantity: c.quantity,
          name: p.name,
          slug: p.slug,
          priceKobo: p.priceKobo,
          stock: p.stock,
          imageUrl: p.imageUrl,
          line: p.priceKobo * c.quantity,
        };
      })
      .filter(Boolean) as Array<{
      productId: number;
      quantity: number;
      name: string;
      slug: string;
      priceKobo: number;
      stock: number;
      imageUrl?: string | null;
      line: number;
    }>;
  }, [cart, catalog]);

  const total = lines.reduce((s, l) => s + l.line, 0);
  const unavailable =
    loaded && cart.length > 0 && lines.length < cart.length
      ? cart.length - lines.length
      : 0;

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <Link href={`/store/${slug}`} className="text-sm font-medium text-brand-700">
        ← Back to store
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-ink-950">Cart</h1>

      {!loaded ? (
        <p className="mt-6 text-sm text-ink-500">Loading cart…</p>
      ) : lines.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-ink-800">Your cart is empty</p>
          <Link
            href={`/store/${slug}`}
            className="mt-3 inline-block text-sm font-medium text-brand-700"
          >
            Continue shopping
          </Link>
        </div>
      ) : (
        <>
          {unavailable > 0 ? (
            <p className="mt-3 text-sm text-amber-700">
              Some items were removed because they are no longer available.
            </p>
          ) : null}
          <ul className="mt-6 space-y-3">
            {lines.map((l) => (
              <li
                key={l.productId}
                className="flex gap-3 rounded-xl border border-ink-100 bg-white p-3"
              >
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                  {l.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={l.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : null}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/store/${slug}/product/${l.slug}`}
                    className="font-medium text-ink-900 hover:text-brand-700"
                  >
                    {l.name}
                  </Link>
                  <p className="text-sm text-ink-500">
                    {formatNgn(l.priceKobo)} each · {l.stock} left
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="inline-flex items-center rounded-lg border border-ink-200">
                      <button
                        type="button"
                        aria-label="Decrease"
                        onClick={() =>
                          persist(
                            setCartLineQuantity(
                              cart,
                              l.productId,
                              l.quantity - 1,
                              l.stock
                            )
                          )
                        }
                        className="px-2.5 py-1 text-sm"
                      >
                        −
                      </button>
                      <span className="min-w-[1.5rem] text-center text-sm tabular-nums">
                        {l.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Increase"
                        disabled={l.quantity >= l.stock}
                        onClick={() =>
                          persist(
                            setCartLineQuantity(
                              cart,
                              l.productId,
                              l.quantity + 1,
                              l.stock
                            )
                          )
                        }
                        className="px-2.5 py-1 text-sm disabled:text-ink-300"
                      >
                        +
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-ink-900">
                        {formatNgn(l.line)}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          persist(
                            cart.filter((c) => c.productId !== l.productId)
                          )
                        }
                        className="text-xs text-ink-400 hover:text-red-600"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-6 rounded-xl border border-ink-100 bg-white p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-500">Subtotal</span>
              <span className="font-semibold tabular-nums text-ink-950">
                {formatNgn(total)}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-400">
              Final total is confirmed at checkout (server-priced).
            </p>
            <Link
              href={`/store/${slug}/checkout`}
              className="mt-4 block rounded-lg bg-brand-600 py-3 text-center text-sm font-semibold text-white"
            >
              Proceed to checkout
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
