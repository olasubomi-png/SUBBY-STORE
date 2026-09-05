"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatNgn } from "@/lib/money";

type Order = {
  id: number;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  deliveryAddress?: string | null;
  note?: string | null;
  totalKobo: number;
  subtotalKobo?: number;
  currency?: string;
  paymentStatus: string;
  orderStatus: string;
  paymentReference?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

const FULFILLMENT_ACTIONS = [
  "processing",
  "shipped",
  "delivered",
  "cancelled",
] as const;

const PAYMENT_FILTERS = [
  { value: "all", label: "All payments" },
  { value: "pending", label: "Awaiting payment" },
  { value: "paid", label: "Paid" },
  { value: "failed", label: "Failed" },
] as const;

const ORDER_FILTERS = [
  { value: "all", label: "All fulfillment" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "processing", label: "Processing" },
  { value: "shipped", label: "Shipped" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
  { value: "expired", label: "Expired" },
  { value: "refund_required", label: "Refund required" },
] as const;

function formatWhen(value?: string | Date | null): string {
  if (!value) return "—";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function paymentBadgeClass(status: string): string {
  switch (status) {
    case "paid":
      return "bg-emerald-50 text-emerald-800";
    case "pending":
      return "bg-amber-50 text-amber-800";
    case "failed":
      return "bg-red-50 text-red-700";
    default:
      return "bg-ink-100 text-ink-600";
  }
}

function orderBadgeClass(status: string): string {
  switch (status) {
    case "refund_required":
      return "bg-amber-50 text-amber-900";
    case "delivered":
      return "bg-emerald-50 text-emerald-800";
    case "cancelled":
    case "expired":
    case "failed":
      return "bg-red-50 text-red-700";
    case "shipped":
    case "processing":
      return "bg-brand-50 text-brand-800";
    default:
      return "bg-ink-100 text-ink-600";
  }
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [paymentFilter, setPaymentFilter] = useState("all");
  const [orderFilter, setOrderFilter] = useState("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [statusBusy, setStatusBusy] = useState<number | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orders", {
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
        setError("Your session has expired. Please log in again.");
        setOrders([]);
        return;
      }
      if (!res.ok) {
        const msg =
          data &&
          typeof data === "object" &&
          "error" in data &&
          typeof (data as { error: unknown }).error === "string"
            ? (data as { error: string }).error
            : `Could not load orders (${res.status})`;
        setError(msg);
        setOrders([]);
        return;
      }
      const list =
        data &&
        typeof data === "object" &&
        "orders" in data &&
        Array.isArray((data as { orders: unknown }).orders)
          ? (data as { orders: Order[] }).orders
          : [];
      setOrders(list);
    } catch {
      setError("Network error. Check your connection and try again.");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const stats = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter((o) => o.paymentStatus === "paid");
    const awaiting = orders.filter((o) => o.paymentStatus === "pending");
    const revenueKobo = paid.reduce((s, o) => s + (o.totalKobo || 0), 0);
    return {
      total,
      paidCount: paid.length,
      awaitingCount: awaiting.length,
      revenueKobo,
    };
  }, [orders]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (paymentFilter !== "all" && o.paymentStatus !== paymentFilter) {
        return false;
      }
      if (orderFilter !== "all" && o.orderStatus !== orderFilter) {
        return false;
      }
      if (!q) return true;
      const hay = [
        String(o.id),
        o.customerName,
        o.customerPhone,
        o.customerEmail,
        o.paymentReference,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orders, query, paymentFilter, orderFilter]);

  const selected = useMemo(
    () => orders.find((o) => o.id === selectedId) ?? null,
    [orders, selectedId]
  );

  async function setStatus(orderId: number, orderStatus: string) {
    setStatusBusy(orderId);
    setStatusError(null);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId, orderStatus }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Update failed"
        );
      }
      await load();
    } catch (e) {
      setStatusError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setStatusBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-950">Orders</h1>
          <p className="mt-1 text-sm text-ink-500">
            Track payments and fulfill customer orders.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:opacity-60"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "Total orders", value: String(stats.total) },
          { label: "Paid orders", value: String(stats.paidCount) },
          { label: "Awaiting payment", value: String(stats.awaitingCount) },
          { label: "Paid revenue", value: formatNgn(stats.revenueKobo) },
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

      <div className="space-y-3 rounded-xl border border-ink-100 bg-white p-4">
        <div className="relative">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ID, name, phone, email, or reference…"
            className="w-full rounded-lg border border-ink-200 px-3 py-2.5 pr-16 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            aria-label="Search orders"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-ink-500 hover:text-ink-800"
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <label className="flex flex-1 flex-col gap-1 text-xs text-ink-500">
            Payment status
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value)}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800"
            >
              {PAYMENT_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-1 flex-col gap-1 text-xs text-ink-500">
            Fulfillment status
            <select
              value={orderFilter}
              onChange={(e) => setOrderFilter(e.target.value)}
              className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800"
            >
              {ORDER_FILTERS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="text-xs text-ink-400">
          Showing {filtered.length} of {orders.length} order
          {orders.length === 1 ? "" : "s"}
        </p>
      </div>

      {statusError ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {statusError}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-ink-500">Loading orders…</p>
      ) : error ? (
        <div className="rounded-xl border border-ink-100 bg-white p-6 text-center">
          <p className="font-medium text-ink-900">Could not load orders</p>
          <p className="mt-1 text-sm text-ink-500">{error}</p>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-800"
          >
            Try again
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center">
          <p className="font-medium text-ink-900">
            {orders.length === 0 ? "No orders yet" : "No matching orders"}
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {orders.length === 0
              ? "Share your store link to receive your first order."
              : "Try a different search or clear the filters."}
          </p>
          {orders.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                setQuery("");
                setPaymentFilter("all");
                setOrderFilter("all");
              }}
              className="mt-3 text-sm font-medium text-brand-700"
            >
              Reset filters
            </button>
          ) : null}
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-ink-100 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Order</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Payment</th>
                  <th className="px-4 py-3 font-medium">Fulfillment</th>
                  <th className="px-4 py-3 font-medium text-right">Total</th>
                  <th className="px-4 py-3 font-medium"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-ink-50/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-ink-900">#{o.id}</p>
                      <p className="text-xs text-ink-400">
                        {formatWhen(o.createdAt)}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-ink-800">{o.customerName}</p>
                      <p className="text-xs text-ink-400">
                        {o.customerPhone || o.customerEmail || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${paymentBadgeClass(o.paymentStatus)}`}
                      >
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${orderBadgeClass(o.orderStatus)}`}
                      >
                        {o.orderStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold tabular-nums text-ink-950">
                      {formatNgn(o.totalKobo)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelectedId(o.id)}
                        className="text-sm font-medium text-brand-700 hover:text-brand-800"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {filtered.map((o) => (
              <li
                key={o.id}
                className="rounded-xl border border-ink-100 bg-white p-4 text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-ink-900">#{o.id}</p>
                    <p className="mt-0.5 text-ink-700">{o.customerName}</p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {formatWhen(o.createdAt)}
                    </p>
                  </div>
                  <p className="font-semibold tabular-nums text-ink-950">
                    {formatNgn(o.totalKobo)}
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${paymentBadgeClass(o.paymentStatus)}`}
                  >
                    {o.paymentStatus}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${orderBadgeClass(o.orderStatus)}`}
                  >
                    {o.orderStatus.replace(/_/g, " ")}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(o.id)}
                  className="mt-3 text-sm font-medium text-brand-700"
                >
                  View details
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {selected ? (
        <div
          className="fixed inset-0 z-40 flex items-end justify-center bg-ink-950/40 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="order-detail-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
        >
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl border border-ink-100 bg-white p-5 shadow-xl sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2
                  id="order-detail-title"
                  className="text-lg font-semibold text-ink-950"
                >
                  Order #{selected.id}
                </h2>
                <p className="mt-0.5 text-xs text-ink-400">
                  {formatWhen(selected.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-lg border border-ink-200 px-2.5 py-1 text-sm text-ink-600"
              >
                Close
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-ink-50 p-3">
                <p className="text-xs uppercase text-ink-400">Total</p>
                <p className="mt-1 font-semibold tabular-nums text-ink-950">
                  {formatNgn(selected.totalKobo)}
                </p>
              </div>
              <div className="rounded-lg bg-ink-50 p-3">
                <p className="text-xs uppercase text-ink-400">Payment</p>
                <p className="mt-1">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${paymentBadgeClass(selected.paymentStatus)}`}
                  >
                    {selected.paymentStatus}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  Customer
                </h3>
                <p className="mt-1 font-medium text-ink-900">
                  {selected.customerName}
                </p>
                {selected.customerPhone ? (
                  <p className="text-ink-600">{selected.customerPhone}</p>
                ) : null}
                {selected.customerEmail ? (
                  <p className="text-ink-600">{selected.customerEmail}</p>
                ) : null}
              </section>

              {selected.deliveryAddress ? (
                <section>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-400">
                    Delivery address
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-ink-700">
                    {selected.deliveryAddress}
                  </p>
                </section>
              ) : null}

              {selected.note ? (
                <section>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-ink-400">
                    Customer note
                  </h3>
                  <p className="mt-1 whitespace-pre-wrap text-ink-700">
                    {selected.note}
                  </p>
                </section>
              ) : null}

              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  Payment reference
                </h3>
                <p className="mt-1 break-all font-mono text-xs text-ink-600">
                  {selected.paymentReference || "—"}
                </p>
              </section>

              <section>
                <h3 className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  Fulfillment
                </h3>
                <p className="mt-1">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${orderBadgeClass(selected.orderStatus)}`}
                  >
                    {selected.orderStatus.replace(/_/g, " ")}
                  </span>
                </p>
              </section>
            </div>

            {selected.orderStatus === "refund_required" ? (
              <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900">
                Refund required — payment was received but inventory could not
                be fulfilled. This status cannot be changed from here.
              </p>
            ) : (
              <div className="mt-5">
                <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                  Update fulfillment
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {FULFILLMENT_ACTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={
                        statusBusy === selected.id ||
                        selected.orderStatus === s
                      }
                      onClick={() => void setStatus(selected.id, s)}
                      className="rounded-md border border-ink-200 px-2.5 py-1.5 text-xs capitalize text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {statusBusy === selected.id ? "…" : s}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
