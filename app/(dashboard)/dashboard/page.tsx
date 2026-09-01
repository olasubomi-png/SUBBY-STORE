"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatNgn } from "@/lib/money";

type Stats = {
  salesKobo: number;
  orderCount: number;
  productCount: number;
  customerCount: number;
  recentOrders: Array<{
    id: number;
    totalKobo: number;
    paymentStatus: string;
    orderStatus: string;
  }>;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [stores, setStores] = useState<Array<{ id: number; name: string; slug: string }>>([]);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => {
        setStats(d.stats);
        setStores(d.stores || []);
      });
  }, []);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (!stats) {
    return <p className="text-sm text-ink-500">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">
          {greeting} 👋
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Here is what is happening in your store.
        </p>
      </div>

      {stores.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center">
          <p className="font-medium text-ink-900">No store yet</p>
          <p className="mt-1 text-sm text-ink-500">
            Create your store to start adding products.
          </p>
          <Link
            href="/dashboard/new-store"
            className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
          >
            Create store
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Sales", value: formatNgn(stats.salesKobo) },
              { label: "Orders", value: String(stats.orderCount) },
              { label: "Products", value: String(stats.productCount) },
              { label: "Customers", value: String(stats.customerCount) },
            ].map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-ink-100 bg-white p-4"
              >
                <p className="text-xs uppercase tracking-wide text-ink-400">
                  {c.label}
                </p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-ink-950">
                  {c.value}
                </p>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold text-ink-950">Recent orders</h2>
              <Link
                href="/dashboard/orders"
                className="text-sm text-brand-700"
              >
                View all
              </Link>
            </div>
            {stats.recentOrders.length === 0 ? (
              <p className="rounded-xl border border-ink-100 bg-white p-6 text-sm text-ink-500">
                No orders yet. Share your store link to get your first sale.
              </p>
            ) : (
              <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white">
                {stats.recentOrders.map((o) => (
                  <li
                    key={o.id}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                  >
                    <span className="font-medium text-ink-800">#{o.id}</span>
                    <span className="tabular-nums text-ink-700">
                      {formatNgn(o.totalKobo)}
                    </span>
                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs uppercase text-ink-600">
                      {o.paymentStatus}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {stores[0] && (
            <div className="rounded-xl border border-ink-100 bg-white p-4">
              <p className="text-xs uppercase text-ink-400">Your store</p>
              <p className="mt-1 font-medium text-ink-950">{stores[0].name}</p>
              <p className="mt-1 break-all text-sm text-brand-700">
                /store/{stores[0].slug}
              </p>
              <Link
                href={`/store/${stores[0].slug}`}
                className="mt-3 inline-block text-sm font-medium text-brand-700"
              >
                View store →
              </Link>
            </div>
          )}
        </>
      )}
    </div>
  );
}
