"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatNgn } from "@/lib/money";

type Line = { productId: number; quantity: number };

export default function CartPage() {
  const params = useParams();
  const slug = String(params.slug);
  const [cart, setCart] = useState<Line[]>([]);
  const [catalog, setCatalog] = useState<
    Array<{ id: number; name: string; priceKobo: number; stock: number }>
  >([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`subby_cart_${slug}`);
      if (raw) setCart(JSON.parse(raw));
    } catch {
      /* */
    }
    fetch(`/api/public/store/${slug}`)
      .then((r) => r.json())
      .then((d) => setCatalog(d.products || []))
      .catch(() => undefined);
  }, [slug]);

  function persist(next: Line[]) {
    setCart(next);
    localStorage.setItem(`subby_cart_${slug}`, JSON.stringify(next));
  }

  const lines = cart
    .map((c) => {
      const p = catalog.find((x) => x.id === c.productId);
      if (!p) return null;
      return {
        ...c,
        name: p.name,
        priceKobo: p.priceKobo,
        line: p.priceKobo * c.quantity,
      };
    })
    .filter(Boolean) as Array<{
    productId: number;
    quantity: number;
    name: string;
    priceKobo: number;
    line: number;
  }>;

  const total = lines.reduce((s, l) => s + l.line, 0);

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <Link href={`/store/${slug}`} className="text-sm text-brand-700">
        ← Back to store
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Cart</h1>
      {lines.length === 0 ? (
        <p className="mt-6 text-sm text-ink-500">Your cart is empty.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {lines.map((l) => (
            <li
              key={l.productId}
              className="flex items-center justify-between gap-3 rounded-xl border border-ink-100 bg-white p-3"
            >
              <div>
                <p className="font-medium text-ink-900">{l.name}</p>
                <p className="text-sm text-ink-500">
                  {formatNgn(l.priceKobo)} × {l.quantity}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="h-8 w-8 rounded-lg border border-ink-200"
                  onClick={() =>
                    persist(
                      cart
                        .map((c) =>
                          c.productId === l.productId
                            ? { ...c, quantity: c.quantity - 1 }
                            : c
                        )
                        .filter((c) => c.quantity > 0)
                    )
                  }
                >
                  −
                </button>
                <span className="w-6 text-center tabular-nums">{l.quantity}</span>
                <button
                  type="button"
                  className="h-8 w-8 rounded-lg border border-ink-200"
                  onClick={() =>
                    persist(
                      cart.map((c) =>
                        c.productId === l.productId
                          ? { ...c, quantity: c.quantity + 1 }
                          : c
                      )
                    )
                  }
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {lines.length > 0 && (
        <div className="mt-6 space-y-3">
          <p className="flex justify-between text-sm">
            <span className="text-ink-500">Total</span>
            <span className="font-semibold tabular-nums">{formatNgn(total)}</span>
          </p>
          <Link
            href={`/store/${slug}/checkout`}
            className="block rounded-lg bg-brand-600 py-3 text-center text-sm font-semibold text-white"
          >
            Checkout
          </Link>
        </div>
      )}
    </div>
  );
}
