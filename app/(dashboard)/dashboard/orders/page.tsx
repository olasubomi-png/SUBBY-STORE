"use client";

import { useEffect, useState } from "react";
import { formatNgn } from "@/lib/money";

type Order = {
  id: number;
  customerName: string;
  totalKobo: number;
  paymentStatus: string;
  orderStatus: string;
  createdAt: string;
};

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);

  async function load() {
    const d = await fetch("/api/orders").then((r) => r.json());
    setOrders(d.orders || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function setStatus(orderId: number, orderStatus: string) {
    await fetch("/api/orders", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId, orderStatus }),
    });
    await load();
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Orders</h1>
      {orders.length === 0 ? (
        <p className="rounded-xl border border-ink-100 bg-white p-6 text-sm text-ink-500">
          No orders yet.
        </p>
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li
              key={o.id}
              className="rounded-xl border border-ink-100 bg-white p-4 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-ink-900">#{o.id}</span>
                <span className="tabular-nums font-medium">
                  {formatNgn(o.totalKobo)}
                </span>
              </div>
              <p className="mt-1 text-ink-600">{o.customerName}</p>
              <p className="mt-1 text-xs uppercase text-ink-400">
                Payment {o.paymentStatus} · Order {o.orderStatus}
              </p>
              {o.orderStatus === "refund_required" ? (
                <p className="mt-2 rounded-md bg-amber-50 px-2 py-1.5 text-xs font-medium text-amber-800">
                  Refund required — payment received but inventory could not be
                  fulfilled.
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {["processing", "shipped", "delivered", "cancelled"].map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(o.id, s)}
                      className="rounded-md border border-ink-200 px-2 py-1 text-xs capitalize text-ink-700"
                    >
                      {s}
                    </button>
                  )
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
