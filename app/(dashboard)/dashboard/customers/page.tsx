"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatNgn } from "@/lib/money";
import {
  customerContactLinks,
  type CustomerDetail,
  type CustomerInsights,
  type CustomerSummary,
  type CustomerType,
} from "@/lib/customers/types";

type FilterType = "all" | CustomerType;

function typeLabel(t: CustomerType): string {
  if (t === "vip") return "VIP";
  if (t === "returning") return "Returning";
  return "New";
}

function typeClass(t: CustomerType): string {
  if (t === "vip") return "bg-amber-50 text-amber-800 ring-amber-200";
  if (t === "returning") return "bg-brand-50 text-brand-700 ring-brand-100";
  return "bg-ink-100 text-ink-600 ring-ink-200";
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<CustomerSummary[]>([]);
  const [insights, setInsights] = useState<CustomerInsights | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<CustomerDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/customers", {
        credentials: "include",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Your session has expired. Please log in again.");
        setCustomers([]);
        setInsights(null);
        return;
      }
      if (!res.ok) {
        setError(body.error || `Could not load customers (${res.status})`);
        return;
      }
      setCustomers(Array.isArray(body.customers) ? body.customers : []);
      setInsights(body.insights || null);
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return customers.filter((c) => {
      if (typeFilter !== "all" && c.type !== typeFilter) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        (c.email || "").toLowerCase().includes(q) ||
        (c.phone || "").toLowerCase().includes(q)
      );
    });
  }, [customers, query, typeFilter]);

  async function openDetail(key: string) {
    setSelectedKey(key);
    setDetail(null);
    setDetailError("");
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/customers/${encodeURIComponent(key)}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setDetailError(body.error || "Could not load customer");
        return;
      }
      setDetail(body.customer as CustomerDetail);
    } catch {
      setDetailError("Network error");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetail() {
    setSelectedKey(null);
    setDetail(null);
    setDetailError("");
  }

  const contact = detail
    ? customerContactLinks({ phone: detail.phone, email: detail.email })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-950">Customers</h1>
          <p className="mt-1 text-sm text-ink-500">
            People who have ordered from your store
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800"
        >
          Refresh
        </button>
      </div>

      {insights ? (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Customers", value: String(insights.totalCustomers) },
            { label: "New", value: String(insights.newCustomers) },
            {
              label: "Returning",
              value: String(insights.returningCustomers),
            },
            {
              label: "Revenue",
              value: formatNgn(insights.totalRevenueKobo),
            },
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
      ) : null}

      {insights && insights.totalCustomers > 0 ? (
        <p className="text-xs text-ink-500">
          Avg. order value {formatNgn(insights.averageOrderValueKobo)}
          {insights.repeatPurchaseRate != null
            ? ` · Repeat rate ${(insights.repeatPurchaseRate * 100).toFixed(0)}%`
            : ""}
          {insights.vipCustomers > 0
            ? ` · ${insights.vipCustomers} VIP`
            : ""}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, phone…"
          className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm sm:max-w-xs"
        />
        <div className="flex gap-1 overflow-x-auto">
          {(
            [
              ["all", "All"],
              ["new", "New"],
              ["returning", "Returning"],
              ["vip", "VIP"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTypeFilter(v)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                typeFilter === v
                  ? "bg-ink-900 text-white"
                  : "bg-ink-100 text-ink-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-ink-500">Loading customers…</p>
      ) : error ? (
        <div className="rounded-xl border border-ink-100 bg-white p-6 text-center">
          <p className="font-medium text-ink-900">Could not load customers</p>
          <p className="mt-1 text-sm text-ink-500">{error}</p>
          {error.includes("session") ? (
            <Link
              href="/login"
              className="mt-4 inline-block text-sm font-medium text-brand-700"
            >
              Log in again
            </Link>
          ) : (
            <button
              type="button"
              onClick={() => void load()}
              className="mt-4 rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium"
            >
              Try again
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-4 py-12 text-center">
          <p className="text-sm font-medium text-ink-800">
            {customers.length === 0
              ? "No customers yet"
              : "No customers match your filters"}
          </p>
          <p className="mt-1 text-xs text-ink-500">
            {customers.length === 0
              ? "Customers appear here after someone places an order."
              : "Try clearing search or filters."}
          </p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden overflow-hidden rounded-xl border border-ink-100 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Orders</th>
                  <th className="px-4 py-3 font-medium">Spent</th>
                  <th className="px-4 py-3 font-medium">Last order</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr
                    key={c.key}
                    className="cursor-pointer border-b border-ink-50 hover:bg-ink-50/80"
                    onClick={() => void openDetail(c.key)}
                  >
                    <td className="px-4 py-3 font-medium text-ink-900">
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-ink-600">
                      <div className="truncate max-w-[12rem]">
                        {c.email || "—"}
                      </div>
                      <div className="text-xs text-ink-400">
                        {c.phone || ""}
                      </div>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{c.totalOrders}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatNgn(c.totalSpentKobo)}
                    </td>
                    <td className="px-4 py-3 text-ink-600">
                      {shortDate(c.lastOrderAt)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${typeClass(c.type)}`}
                      >
                        {typeLabel(c.type)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <ul className="space-y-3 md:hidden">
            {filtered.map((c) => (
              <li key={c.key}>
                <button
                  type="button"
                  onClick={() => void openDetail(c.key)}
                  className="w-full rounded-xl border border-ink-100 bg-white p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink-900">{c.name}</p>
                      <p className="text-xs text-ink-500">
                        {c.email || c.phone || "No contact"}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${typeClass(c.type)}`}
                    >
                      {typeLabel(c.type)}
                    </span>
                  </div>
                  <div className="mt-3 flex justify-between text-xs text-ink-500">
                    <span>{c.totalOrders} orders</span>
                    <span className="font-medium tabular-nums text-ink-800">
                      {formatNgn(c.totalSpentKobo)}
                    </span>
                    <span>{shortDate(c.lastOrderAt)}</span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {/* Detail drawer */}
      {selectedKey ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink-950/40">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={closeDetail}
          />
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3">
              <h2 className="text-base font-semibold text-ink-950">
                Customer details
              </h2>
              <button
                type="button"
                onClick={closeDetail}
                className="rounded-lg px-2 py-1 text-sm text-ink-500 hover:bg-ink-50"
              >
                Close
              </button>
            </div>

            <div className="space-y-5 p-4">
              {detailLoading ? (
                <p className="text-sm text-ink-500">Loading…</p>
              ) : detailError ? (
                <p className="text-sm text-red-600">{detailError}</p>
              ) : detail ? (
                <>
                  <div>
                    <p className="text-lg font-semibold text-ink-950">
                      {detail.name}
                    </p>
                    <span
                      className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ${typeClass(detail.type)}`}
                    >
                      {typeLabel(detail.type)}
                    </span>
                    <p className="mt-2 text-sm text-ink-600">
                      {detail.email || "No email"}
                    </p>
                    <p className="text-sm text-ink-600">
                      {detail.phone || "No phone"}
                    </p>
                  </div>

                  {contact ? (
                    <div className="flex flex-wrap gap-2">
                      {contact.tel ? (
                        <a
                          href={contact.tel}
                          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-800"
                        >
                          Call
                        </a>
                      ) : null}
                      {contact.whatsapp ? (
                        <a
                          href={contact.whatsapp}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-800"
                        >
                          WhatsApp
                        </a>
                      ) : null}
                      {contact.mailto ? (
                        <a
                          href={contact.mailto}
                          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-800"
                        >
                          Email
                        </a>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg bg-ink-50 p-3">
                      <p className="text-[11px] uppercase text-ink-400">
                        Orders
                      </p>
                      <p className="text-base font-semibold tabular-nums">
                        {detail.totalOrders}
                      </p>
                    </div>
                    <div className="rounded-lg bg-ink-50 p-3">
                      <p className="text-[11px] uppercase text-ink-400">
                        Spent
                      </p>
                      <p className="text-base font-semibold tabular-nums">
                        {formatNgn(detail.totalSpentKobo)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-ink-50 p-3">
                      <p className="text-[11px] uppercase text-ink-400">
                        First order
                      </p>
                      <p className="text-sm font-medium">
                        {shortDate(detail.firstOrderAt)}
                      </p>
                    </div>
                    <div className="rounded-lg bg-ink-50 p-3">
                      <p className="text-[11px] uppercase text-ink-400">
                        Latest
                      </p>
                      <p className="text-sm font-medium">
                        {shortDate(detail.lastOrderAt)}
                      </p>
                    </div>
                  </div>

                  {detail.products.length > 0 ? (
                    <div>
                      <h3 className="text-sm font-semibold text-ink-900">
                        Purchased products
                      </h3>
                      <ul className="mt-2 space-y-1">
                        {detail.products.slice(0, 12).map((p) => (
                          <li
                            key={p.productName}
                            className="flex justify-between text-sm text-ink-700"
                          >
                            <span className="truncate pr-2">
                              {p.productName}
                            </span>
                            <span className="tabular-nums text-ink-500">
                              ×{p.quantity}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  <div>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-ink-900">
                        Order history
                      </h3>
                      <Link
                        href="/dashboard/orders"
                        className="text-xs font-medium text-brand-700"
                      >
                        Open orders
                      </Link>
                    </div>
                    <ul className="mt-2 space-y-2">
                      {detail.orders.map((o) => (
                        <li
                          key={o.id}
                          className="rounded-lg border border-ink-100 p-3 text-sm"
                        >
                          <div className="flex justify-between gap-2">
                            <span className="font-medium tabular-nums">
                              {formatNgn(o.totalKobo)}
                            </span>
                            <span className="text-xs capitalize text-ink-500">
                              {o.paymentStatus} · {o.orderStatus}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-ink-400">
                            {shortDate(o.createdAt)}
                            {o.paymentReference
                              ? ` · ${o.paymentReference}`
                              : ""}
                          </p>
                          {o.items.length > 0 ? (
                            <p className="mt-1 text-xs text-ink-600">
                              {o.items
                                .map(
                                  (i) => `${i.productName} ×${i.quantity}`
                                )
                                .join(", ")}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </div>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
