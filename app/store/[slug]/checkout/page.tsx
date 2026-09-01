"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const slug = String(params.slug);
  const [items, setItems] = useState<Array<{ productId: number; quantity: number }>>(
    []
  );
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(`subby_cart_${slug}`);
      if (raw) setItems(JSON.parse(raw));
    } catch {
      /* */
    }
  }, [slug]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug: slug,
          customerName,
          customerPhone,
          customerEmail,
          deliveryAddress,
          note,
          items,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Checkout failed");
      localStorage.removeItem(`subby_cart_${slug}`);
      window.location.href = data.authorizationUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed");
      setLoading(false);
    }
  }

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <p className="text-sm text-ink-500">Your cart is empty.</p>
        <Link href={`/store/${slug}`} className="mt-4 inline-block text-brand-700">
          Back to store
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <Link href={`/store/${slug}/cart`} className="text-sm text-brand-700">
        ← Cart
      </Link>
      <h1 className="mt-4 text-2xl font-semibold">Checkout</h1>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
          placeholder="Full name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
          placeholder="Phone number"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          required
        />
        <input
          type="email"
          className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
          placeholder="Email"
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
          required
        />
        <textarea
          className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
          placeholder="Delivery address"
          rows={3}
          value={deliveryAddress}
          onChange={(e) => setDeliveryAddress(e.target.value)}
          required
        />
        <textarea
          className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
          placeholder="Order note (optional)"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
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
