"use client";

import { useCallback, useEffect, useState } from "react";
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

type StoreSummary = { id: number; name: string; slug: string };

function isValidStats(value: unknown): value is Stats {
  if (!value || typeof value !== "object") return false;
  const s = value as Record<string, unknown>;
  return (
    typeof s.salesKobo === "number" &&
    typeof s.orderCount === "number" &&
    typeof s.productCount === "number" &&
    typeof s.customerCount === "number" &&
    Array.isArray(s.recentOrders)
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    try {
      const res = await fetch("/api/dashboard", {
        credentials: "include",
        cache: "no-store",
      });

      let data: unknown = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (res.status === 401) {
        setUnauthorized(true);
        setStats(null);
        setStores([]);
        return;
      }

      if (!res.ok) {
        const message =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Could not load dashboard (${res.status})`;
        setError(message);
        setStats(null);
        setStores([]);
        return;
      }

      const payload = data as {
        stats?: unknown;
        stores?: StoreSummary[];
      };

      if (!isValidStats(payload.stats)) {
        setError("Dashboard response was incomplete. Please try again.");
        setStats(null);
        setStores([]);
        return;
      }

      setStats(payload.stats);
      setStores(Array.isArray(payload.stores) ? payload.stores : []);
    } catch {
      setError("Network error. Check your connection and try again.");
      setStats(null);
      setStores([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  if (loading) {
    return <p className="text-sm text-ink-500">Loading…</p>;
  }

  if (unauthorized) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-6 text-center">
        <p className="font-medium text-ink-900">Your session has expired</p>
        <p className="mt-1 text-sm text-ink-500">
          Please log in again to continue.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
        >
          Log in
        </Link>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-6 text-center">
        <p className="font-medium text-ink-900">Could not load dashboard</p>
        <p className="mt-1 text-sm text-ink-500">
          {error || "Unexpected error"}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-4 rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-800"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-ink-950">{greeting} 👋</h1>
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
                <p className="mt-2 text-lg font-semibold tabular-nums text-ink-950">
                  {c.value}
                </p>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink-900">
                Recent orders
              </h2>
              <Link
                href="/dashboard/orders"
                className="text-sm font-medium text-brand-700"
              >
                View all
              </Link>
            </div>
            {stats.recentOrders.length === 0 ? (
              <p className="rounded-xl border border-dashed border-ink-200 bg-white p-6 text-center text-sm text-ink-500">
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
