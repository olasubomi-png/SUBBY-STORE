"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { formatNgn } from "@/lib/money";

type LookupOrder = {
  id: number;
  paymentReference: string | null;
  paymentStatus: string;
  orderStatus: string;
  totalKobo: number;
  discountKobo: number;
  customerName: string;
  createdAt: string;
  items: Array<{
    productName: string;
    quantity: number;
    lineTotalKobo: number;
  }>;
};

const STEPS = [
  { key: "pending", label: "Pending" },
  { key: "paid", label: "Payment confirmed" },
  { key: "processing", label: "Processing" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
] as const;

function stepIndex(paymentStatus: string, orderStatus: string): number {
  if (orderStatus === "delivered") return 4;
  if (orderStatus === "shipped") return 3;
  if (orderStatus === "processing" || orderStatus === "confirmed") return 2;
  if (paymentStatus === "paid") return 1;
  return 0;
}

export default function OrderTrackPage() {
  const params = useParams();
  const slug = String(params.slug);
  const [reference, setReference] = useState("");
  const [email, setEmail] = useState("");
  const [order, setOrder] = useState<LookupOrder | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setOrder(null);
    try {
      const res = await fetch("/api/orders/lookup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Not found");
      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  }

  const active = order ? stepIndex(order.paymentStatus, order.orderStatus) : -1;

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <Link href={`/store/${slug}`} className="text-sm font-medium text-brand-700">
        ← Back to store
      </Link>
      <h1 className="mt-4 text-2xl font-semibold text-ink-950">Track order</h1>
      <p className="mt-1 text-sm text-ink-500">
        Enter your payment reference and the email used at checkout.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <input
          className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
          placeholder="Payment reference"
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          required
        />
        <input
          type="email"
          className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error ? <p className="text-sm text-red-600">{error}</p> : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Looking up…" : "Track order"}
        </button>
      </form>

      {order ? (
        <div className="mt-8 space-y-4 rounded-2xl border border-ink-100 bg-white p-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">
              Reference
            </p>
            <p className="text-sm font-medium text-ink-900">
              {order.paymentReference}
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>

          <ol className="space-y-2">
            {STEPS.map((s, i) => (
              <li
                key={s.key}
                className={`flex items-center gap-2 text-sm ${
                  i <= active ? "font-medium text-brand-700" : "text-ink-400"
                }`}
              >
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    i <= active
                      ? "bg-brand-600 text-white"
                      : "bg-ink-100 text-ink-400"
                  }`}
                >
                  {i + 1}
                </span>
                {s.label}
              </li>
            ))}
          </ol>

          <div>
            <p className="text-xs uppercase tracking-wide text-ink-400">Items</p>
            <ul className="mt-1 space-y-1">
              {order.items.map((it, idx) => (
                <li
                  key={idx}
                  className="flex justify-between text-sm text-ink-700"
                >
                  <span>
                    {it.productName} × {it.quantity}
                  </span>
                  <span className="tabular-nums">
                    {formatNgn(it.lineTotalKobo)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 flex justify-between border-t border-ink-100 pt-2 text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatNgn(order.totalKobo)}</span>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
