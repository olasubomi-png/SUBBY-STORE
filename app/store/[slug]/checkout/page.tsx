"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { formatNgn } from "@/lib/money";
import {
  clampCartToStock,
  clearCart,
  readCart,
  writeCart,
  type CartLine,
} from "@/lib/storefront/cart-client";

type CatalogProduct = {
  id: number;
  name: string;
  priceKobo: number;
  stock: number;
  active?: boolean;
};

export default function CheckoutPage() {
  const params = useParams();
  const slug = String(params.slug);
  const [items, setItems] = useState<CartLine[]>([]);
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

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
        setItems(clamped);
        writeCart(slug, clamped);
      } catch {
        if (!cancelled) setItems(local);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const summary = useMemo(() => {
    return items
      .map((c) => {
        const p = catalog.find((x) => x.id === c.productId);
        if (!p) return null;
        return {
          name: p.name,
          quantity: c.quantity,
          line: p.priceKobo * c.quantity,
        };
      })
      .filter(Boolean) as Array<{ name: string; quantity: number; line: number }>;
  }, [items, catalog]);

  const previewTotal = summary.reduce((s, l) => s + l.line, 0);

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (customerName.trim().length < 2) errs.customerName = "Enter your full name";
    if (customerPhone.trim().length < 7) errs.customerPhone = "Enter a valid phone number";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      errs.customerEmail = "Enter a valid email";
    }
    if (deliveryAddress.trim().length < 5) {
      errs.deliveryAddress = "Enter a delivery address";
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setError("");
    if (!validate()) return;
    if (items.length === 0) {
      setError("Your cart is empty");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug: slug,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          customerEmail: customerEmail.trim(),
          deliveryAddress: deliveryAddress.trim(),
          note: note.trim() || undefined,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      clearCart(slug);
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoading(false);
    }
  }

  if (!loaded) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center text-sm text-ink-500">
        Loading checkout…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-sm font-medium text-ink-800">Your cart is empty</p>
        <Link
          href={`/store/${slug}`}
          className="mt-4 inline-block text-sm font-medium text-brand-700"
        >
          Back to store
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <Link href={`/store/${slug}/cart`} className="text-sm font-medium text-brand-700">
        ← Cart
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-ink-950">Checkout</h1>

      <div className="mt-4 rounded-xl border border-ink-100 bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
          Order summary
        </p>
        <ul className="mt-2 space-y-1.5">
          {summary.map((l) => (
            <li
              key={l.name + l.quantity}
              className="flex justify-between gap-3 text-sm text-ink-700"
            >
              <span className="min-w-0 truncate">
                {l.name} × {l.quantity}
              </span>
              <span className="tabular-nums">{formatNgn(l.line)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex justify-between border-t border-ink-100 pt-3 text-sm font-semibold text-ink-950">
          <span>Estimated total</span>
          <span className="tabular-nums">{formatNgn(previewTotal)}</span>
        </div>
        <p className="mt-1 text-xs text-ink-400">
          Paystack amount is calculated server-side from current product prices.
        </p>
      </div>

      <form onSubmit={onSubmit} className="mt-6 space-y-3" noValidate>
        <div>
          <input
            className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
            placeholder="Full name"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            autoComplete="name"
          />
          {fieldErrors.customerName ? (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.customerName}</p>
          ) : null}
        </div>
        <div>
          <input
            className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
            placeholder="Phone number"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            autoComplete="tel"
          />
          {fieldErrors.customerPhone ? (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.customerPhone}</p>
          ) : null}
        </div>
        <div>
          <input
            type="email"
            className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
            placeholder="Email"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            autoComplete="email"
          />
          {fieldErrors.customerEmail ? (
            <p className="mt-1 text-xs text-red-600">{fieldErrors.customerEmail}</p>
          ) : null}
        </div>
        <div>
          <textarea
            className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
            placeholder="Delivery address"
            rows={3}
            value={deliveryAddress}
            onChange={(e) => setDeliveryAddress(e.target.value)}
            autoComplete="street-address"
          />
          {fieldErrors.deliveryAddress ? (
            <p className="mt-1 text-xs text-red-600">
              {fieldErrors.deliveryAddress}
            </p>
          ) : null}
        </div>
        <textarea
          className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
          placeholder="Order note (optional)"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Processing…" : "Pay with Paystack"}
        </button>
      </form>
    </div>
  );
}
