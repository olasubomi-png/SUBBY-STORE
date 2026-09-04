"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatNgn } from "@/lib/money";

type DashboardStats = {
  salesKobo: number;
  todaySalesKobo: number;
  orderCount: number;
  todayOrderCount: number;
  paidOrderCount: number;
  pendingOrderCount: number;
  productCount: number;
  activeProductCount: number;
  lowStockCount: number;
  outOfStockCount: number;
  customerCount: number;
  unfulfilledOrderCount: number;
  salesTrend: {
    day: string;
    salesKobo: number;
    orderCount: number;
  }[];
  topProducts: {
    productId: number | null;
    name: string;
    quantity: number;
    revenueKobo: number;
  }[];
  recentOrders: {
    id: number;
    customerName: string;
    totalKobo: number;
    paymentStatus: string;
    orderStatus: string;
    createdAt: string | Date;
  }[];
  lowStockProducts: {
    id: number;
    name: string;
    stock: number;
    priceKobo: number;
    active: boolean;
  }[];
};

type StoreSummary = {
  id: number;
  name: string;
  slug: string;
};

function isStats(value: unknown): value is DashboardStats {
  return Boolean(
    value &&
      typeof value === "object" &&
      "salesKobo" in value &&
      "orderCount" in value &&
      "productCount" in value &&
      "salesTrend" in value,
  );
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
  }).format(new Date(value));
}

function statusClass(status: string) {
  const value = status.toLowerCase();

  if (value === "paid" || value === "delivered") {
    return "bg-emerald-50 text-emerald-700";
  }

  if (
    value === "failed" ||
    value === "cancelled" ||
    value === "refund_required"
  ) {
    return "bg-red-50 text-red-700";
  }

  return "bg-amber-50 text-amber-700";
}

function TrendChart({
  points,
}: {
  points: DashboardStats["salesTrend"];
}) {
  const values = points.map((point) => point.salesKobo);
  const max = Math.max(...values, 1);

  const chartPoints: string = points.length
    ? points
        .map((point, index) => {
          const x =
            points.length === 1
              ? 50
              : (index / (points.length - 1)) * 100;
          const y = 100 - (point.salesKobo / max) * 82;
          return `${x},${y}`;
        })
        .join(" ")
    : "";

  return (
    <div className="mt-6">
      {points.length === 0 ? (
        <div className="flex h-48 items-center justify-center rounded-lg bg-ink-50 text-sm text-ink-500">
          Sales data will appear here after your first paid order.
        </div>
      ) : (
        <>
          <div className="relative h-48 overflow-hidden rounded-lg bg-ink-50">
            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="h-full w-full"
              aria-label="Sales trend"
              role="img"
            >
              <polyline
                points={chartPoints}
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                className="text-brand-600"
              />
            </svg>
          </div>

          <div className="mt-3 flex justify-between text-[11px] text-ink-400">
            {points.map((point) => (
              <span key={point.day}>
                {new Date(`${point.day}T00:00:00`).toLocaleDateString(
                  "en-NG",
                  { weekday: "short" },
                )}
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unauthorized, setUnauthorized] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUnauthorized(false);

    try {
      const response = await fetch("/api/dashboard", {
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json().catch(() => null);

      if (response.status === 401) {
        setUnauthorized(true);
        return;
      }

      if (!response.ok) {
        throw new Error(
          data?.error || `Dashboard request failed (${response.status})`,
        );
      }

      if (!isStats(data?.stats)) {
        throw new Error("Dashboard response was incomplete.");
      }

      setStats(data.stats);
      setStores(Array.isArray(data.stores) ? data.stores : []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Could not load dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();

    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-56 animate-pulse rounded-lg bg-ink-100" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-xl bg-ink-100"
            />
          ))}
        </div>
        <div className="h-72 animate-pulse rounded-xl bg-ink-100" />
      </div>
    );
  }

  if (unauthorized) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-8 text-center">
        <h1 className="font-semibold text-ink-950">
          Your session has expired
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          Please log in again to continue.
        </p>
        <Link
          href="/login"
          className="mt-5 inline-flex rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
        >
          Log in
        </Link>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-ink-100 bg-white p-8 text-center">
        <h1 className="font-semibold text-ink-950">
          Could not load dashboard
        </h1>
        <p className="mt-1 text-sm text-ink-500">
          {error || "Unexpected dashboard error"}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-5 rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-800"
        >
          Try again
        </button>
      </div>
    );
  }

  const store = stores[0];

  const cards = [
    {
      label: "Total revenue",
      value: formatNgn(stats.salesKobo),
      detail: `${formatNgn(stats.todaySalesKobo)} today`,
    },
    {
      label: "Orders",
      value: String(stats.orderCount),
      detail: `${stats.todayOrderCount} today`,
    },
    {
      label: "Products",
      value: String(stats.productCount),
      detail: `${stats.activeProductCount} active`,
    },
    {
      label: "Customers",
      value: String(stats.customerCount),
      detail: `${stats.paidOrderCount} paid orders`,
    },
  ];

  return (
    <div className="space-y-6 pb-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-700">
            Seller dashboard
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink-950 sm:text-3xl">
            {greeting} 👋
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Here&apos;s how your store is performing.
          </p>
        </div>

        {store && (
          <Link
            href={`/store/${store.slug}`}
            target="_blank"
            className="inline-flex w-fit items-center rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-medium text-ink-800 shadow-sm"
          >
            View storefront →
          </Link>
        )}
      </header>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="rounded-xl border border-ink-100 bg-white p-4 shadow-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
              {card.label}
            </p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-ink-950">
              {card.value}
            </p>
            <p className="mt-1 text-xs text-ink-500">{card.detail}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold text-ink-950">Sales overview</h2>
              <p className="mt-1 text-xs text-ink-500">
                Paid sales over the last 7 days
              </p>
            </div>

            <span className="rounded-full bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
              {stats.paidOrderCount} paid
            </span>
          </div>

          <TrendChart points={stats.salesTrend} />
        </div>

        <div className="rounded-xl border border-ink-100 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="font-semibold text-ink-950">
                Inventory alerts
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Products that need attention
              </p>
            </div>

            <Link
              href="/dashboard/products"
              className="text-xs font-medium text-brand-700"
            >
              Manage
            </Link>
          </div>

          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between rounded-lg bg-red-50 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-red-800">
                  Out of stock
                </p>
                <p className="text-xs text-red-600">
                  Customers cannot buy these
                </p>
              </div>
              <span className="text-lg font-semibold text-red-800">
                {stats.outOfStockCount}
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-3">
              <div>
                <p className="text-sm font-medium text-amber-800">
                  Low stock
                </p>
                <p className="text-xs text-amber-600">
                  5 units or fewer
                </p>
              </div>
              <span className="text-lg font-semibold text-amber-800">
                {stats.lowStockCount}
              </span>
            </div>

            {stats.lowStockProducts.length > 0 && (
              <div className="divide-y divide-ink-100">
                {stats.lowStockProducts.slice(0, 4).map((product) => (
                  <div
                    key={product.id}
                    className="flex items-center justify-between py-3"
                  >
                    <p className="truncate pr-3 text-sm text-ink-800">
                      {product.name}
                    </p>
                    <span className="shrink-0 text-xs font-semibold text-ink-500">
                      {product.stock} left
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-ink-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-ink-950">
                Top products
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Best performers by revenue
              </p>
            </div>
          </div>

          {stats.topProducts.length === 0 ? (
            <p className="p-6 text-sm text-ink-500">
              Your best-selling products will appear here.
            </p>
          ) : (
            <div className="divide-y divide-ink-100">
              {stats.topProducts.map((product, index) => (
                <div
                  key={`${product.productId ?? "snapshot"}-${product.name}`}
                  className="flex items-center gap-3 px-5 py-4"
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-600">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink-900">
                      {product.name}
                    </p>
                    <p className="mt-0.5 text-xs text-ink-500">
                      {product.quantity} sold
                    </p>
                  </div>

                  <span className="text-sm font-semibold tabular-nums text-ink-900">
                    {formatNgn(product.revenueKobo)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-ink-100 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
            <div>
              <h2 className="font-semibold text-ink-950">
                Recent orders
              </h2>
              <p className="mt-1 text-xs text-ink-500">
                Latest activity in your store
              </p>
            </div>

            <Link
              href="/dashboard/orders"
              className="text-xs font-medium text-brand-700"
            >
              View all
            </Link>
          </div>

          {stats.recentOrders.length === 0 ? (
            <p className="p-6 text-sm text-ink-500">
              No orders yet. Share your storefront to get your first sale.
            </p>
          ) : (
            <div className="divide-y divide-ink-100">
              {stats.recentOrders.map((order) => (
                <Link
                  key={order.id}
                  href={`/dashboard/orders`}
                  className="flex items-center gap-3 px-5 py-4 transition hover:bg-ink-50"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-ink-900">
                        #{order.id}
                      </p>
                      <span className="truncate text-xs text-ink-500">
                        {order.customerName}
                      </span>
                    </div>

                    <p className="mt-1 text-xs text-ink-400">
                      {formatDate(order.createdAt)}
                    </p>
                  </div>

                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums text-ink-900">
                      {formatNgn(order.totalKobo)}
                    </p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${statusClass(
                        order.paymentStatus,
                      )}`}
                    >
                      {order.paymentStatus}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-ink-100 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold text-ink-950">Quick actions</h2>
            <p className="mt-1 text-xs text-ink-500">
              Common seller tasks
            </p>
          </div>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Link
            href="/dashboard/products"
            className="rounded-lg border border-ink-200 p-4 transition hover:border-brand-300 hover:bg-brand-50"
          >
            <p className="text-sm font-semibold text-ink-900">
              Add product
            </p>
            <p className="mt-1 text-xs text-ink-500">
              Create a new product listing
            </p>
          </Link>

          <Link
            href="/dashboard/orders"
            className="rounded-lg border border-ink-200 p-4 transition hover:border-brand-300 hover:bg-brand-50"
          >
            <p className="text-sm font-semibold text-ink-900">
              Manage orders
            </p>
            <p className="mt-1 text-xs text-ink-500">
              {stats.unfulfilledOrderCount} awaiting fulfilment
            </p>
          </Link>

          <Link
            href="/dashboard/settings"
            className="rounded-lg border border-ink-200 p-4 transition hover:border-brand-300 hover:bg-brand-50"
          >
            <p className="text-sm font-semibold text-ink-900">
              Store settings
            </p>
            <p className="mt-1 text-xs text-ink-500">
              Branding and store information
            </p>
          </Link>
        </div>
      </section>
    </div>
  );
}
