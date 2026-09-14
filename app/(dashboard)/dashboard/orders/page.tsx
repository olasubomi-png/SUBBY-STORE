"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatNgn } from "@/lib/money";
import { customerContactLinks } from "@/lib/customers/types";
import { ALLOWED_TRANSITIONS } from "@/lib/orders/transitions";

type Order = {
  id: number;
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  deliveryAddress?: string | null;
  note?: string | null;
  sellerNote?: string | null;
  totalKobo: number;
  subtotalKobo?: number;
  discountKobo?: number;
  couponCode?: string | null;
  currency?: string;
  paymentStatus: string;
  orderStatus: string;
  paymentReference?: string | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type OrderItem = {
  productNameSnapshot: string;
  quantity: number;
  unitPriceKoboSnapshot: number;
  lineTotalKobo: number;
};

type Summary = {
  totalOrders: number;
  pending: number;
  paid: number;
  processing: number;
  completed: number;
  cancelled: number;
  revenueKobo: number;
};

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
      return "bg-red-50 text-red-700";
    case "shipped":
    case "processing":
      return "bg-brand-50 text-brand-800";
    default:
      return "bg-ink-100 text-ink-600";
  }
}

function nextActions(status: string, paymentStatus: string): string[] {
  const allowed = [...(ALLOWED_TRANSITIONS[status] || [])];
  // Prefer not offering shipped/delivered on unpaid orders
  if (paymentStatus !== "paid") {
    return allowed.filter((s) => s === "cancelled" || s === "confirmed");
  }
  return allowed;
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const [orderStatus, setOrderStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState<{
    order: Order;
    items: OrderItem[];
  } | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sellerNoteDraft, setSellerNoteDraft] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(pageSize));
      if (q.trim()) params.set("q", q.trim());
      if (paymentStatus !== "all") params.set("paymentStatus", paymentStatus);
      if (orderStatus !== "all") params.set("orderStatus", orderStatus);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await fetch(`/api/orders?${params}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Your session has expired. Please log in again.");
        return;
      }
      if (!res.ok) {
        setError(body.error || "Could not load orders");
        return;
      }
      setOrders(Array.isArray(body.orders) ? body.orders : []);
      setTotal(Number(body.total || 0));
      setSummary(body.summary || null);
      setSelected([]);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, q, paymentStatus, orderStatus, from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const allSelected = useMemo(
    () => orders.length > 0 && selected.length === orders.length,
    [orders, selected]
  );

  function toggleAll() {
    if (allSelected) setSelected([]);
    else setSelected(orders.map((o) => o.id));
  }

  function toggleOne(id: number) {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function updateStatus(orderId: number, next: string) {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderId, orderStatus: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Update failed");
      setMessage(`Order #${orderId} → ${next}`);
      await load();
      if (detail?.order.id === orderId) {
        await openDetail(orderId);
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusy(false);
    }
  }

  async function bulkStatus(next: string) {
    if (selected.length === 0) return;
    if (next === "cancelled") {
      const ok = window.confirm(
        `Cancel ${selected.length} order(s)? Unpaid reserved stock will be released.`
      );
      if (!ok) return;
    }
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ orderIds: selected, orderStatus: next }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Bulk update failed");
      const results = body.results as Array<{ ok: boolean }>;
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      setMessage(
        `Updated ${okCount} order(s)${failCount ? `, ${failCount} skipped` : ""}`
      );
      await load();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setBusy(false);
    }
  }

  async function openDetail(id: number) {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/orders/${id}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Not found");
      setDetail({
        order: body.order,
        items: body.items || [],
      });
      setSellerNoteDraft(body.order.sellerNote || "");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not load order");
    } finally {
      setDetailLoading(false);
    }
  }

  async function saveSellerNote() {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await fetch("/api/orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          orderId: detail.order.id,
          sellerNote: sellerNoteDraft,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Save failed");
      setDetail({ ...detail, order: { ...detail.order, ...body.order } });
      setMessage("Seller note saved");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const contact = detail
    ? customerContactLinks({
        phone: detail.order.customerPhone,
        email: detail.order.customerEmail,
      })
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-950">Orders</h1>
          <p className="mt-1 text-sm text-ink-500">
            Search, filter, fulfill, and track customer orders
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      {summary ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {[
            { label: "Total", value: String(summary.totalOrders) },
            { label: "Awaiting payment", value: String(summary.pending) },
            { label: "Paid", value: String(summary.paid) },
            { label: "In progress", value: String(summary.processing) },
            { label: "Delivered", value: String(summary.completed) },
            { label: "Cancelled", value: String(summary.cancelled) },
            {
              label: "Revenue",
              value: formatNgn(summary.revenueKobo),
            },
          ].map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-ink-100 bg-white p-3"
            >
              <p className="text-[11px] uppercase tracking-wide text-ink-400">
                {c.label}
              </p>
              <p className="mt-1 text-base font-semibold tabular-nums text-ink-950">
                {c.value}
              </p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-col gap-2 rounded-xl border border-ink-100 bg-white p-3 sm:flex-row sm:flex-wrap sm:items-end">
        <label className="block min-w-[12rem] flex-1 text-xs">
          <span className="text-ink-500">Search</span>
          <input
            value={q}
            onChange={(e) => {
              setPage(1);
              setQ(e.target.value);
            }}
            placeholder="Name, phone, email, ref, ID…"
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs">
          <span className="text-ink-500">Payment</span>
          <select
            value={paymentStatus}
            onChange={(e) => {
              setPage(1);
              setPaymentStatus(e.target.value);
            }}
            className="mt-1 block rounded-lg border border-ink-200 px-2 py-2 text-sm"
          >
            {PAYMENT_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-ink-500">Fulfillment</span>
          <select
            value={orderStatus}
            onChange={(e) => {
              setPage(1);
              setOrderStatus(e.target.value);
            }}
            className="mt-1 block rounded-lg border border-ink-200 px-2 py-2 text-sm"
          >
            {ORDER_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs">
          <span className="text-ink-500">From</span>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setPage(1);
              setFrom(e.target.value);
            }}
            className="mt-1 block rounded-lg border border-ink-200 px-2 py-2 text-sm"
          />
        </label>
        <label className="block text-xs">
          <span className="text-ink-500">To</span>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setPage(1);
              setTo(e.target.value);
            }}
            className="mt-1 block rounded-lg border border-ink-200 px-2 py-2 text-sm"
          />
        </label>
      </div>

      {selected.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-100 bg-brand-50 px-3 py-2 text-sm">
          <span className="font-medium text-brand-900">
            {selected.length} selected
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => void bulkStatus("processing")}
            className="rounded-lg bg-white px-2 py-1 text-xs font-medium ring-1 ring-ink-200"
          >
            Mark processing
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void bulkStatus("delivered")}
            className="rounded-lg bg-white px-2 py-1 text-xs font-medium ring-1 ring-ink-200"
          >
            Mark delivered
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void bulkStatus("cancelled")}
            className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {message ? (
        <p className="text-sm text-ink-600">{message}</p>
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
            className="mt-4 rounded-lg border border-ink-200 px-4 py-2 text-sm"
          >
            Try again
          </button>
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-200 bg-ink-50 px-4 py-12 text-center">
          <p className="text-sm font-medium text-ink-800">No orders found</p>
          <p className="mt-1 text-xs text-ink-500">
            Adjust filters or wait for your next customer order.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-ink-100 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase text-ink-400">
                <tr>
                  <th className="px-3 py-3">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={toggleAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="px-3 py-3">Order</th>
                  <th className="px-3 py-3">Customer</th>
                  <th className="px-3 py-3">Total</th>
                  <th className="px-3 py-3">Payment</th>
                  <th className="px-3 py-3">Fulfillment</th>
                  <th className="px-3 py-3">Date</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr
                    key={o.id}
                    className="cursor-pointer border-b border-ink-50 hover:bg-ink-50/80"
                    onClick={() => void openDetail(o.id)}
                  >
                    <td
                      className="px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(o.id)}
                        onChange={() => toggleOne(o.id)}
                        aria-label={`Select order ${o.id}`}
                      />
                    </td>
                    <td className="px-3 py-3 font-medium tabular-nums">
                      #{o.id}
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-medium text-ink-900">
                        {o.customerName}
                      </div>
                      <div className="text-xs text-ink-400">
                        {o.customerPhone || o.customerEmail}
                      </div>
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {formatNgn(o.totalKobo)}
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${paymentBadgeClass(o.paymentStatus)}`}
                      >
                        {o.paymentStatus}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize ${orderBadgeClass(o.orderStatus)}`}
                      >
                        {o.orderStatus.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-ink-500">
                      {formatWhen(o.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {orders.map((o) => (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => void openDetail(o.id)}
                  className="w-full rounded-xl border border-ink-100 bg-white p-4 text-left"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-ink-900">
                        #{o.id} · {o.customerName}
                      </p>
                      <p className="text-xs text-ink-500">
                        {formatWhen(o.createdAt)}
                      </p>
                    </div>
                    <p className="font-semibold tabular-nums">
                      {formatNgn(o.totalKobo)}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${paymentBadgeClass(o.paymentStatus)}`}
                    >
                      {o.paymentStatus}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] capitalize ${orderBadgeClass(o.orderStatus)}`}
                    >
                      {o.orderStatus.replace(/_/g, " ")}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between text-sm text-ink-600">
            <span>
              Page {page} of {pageCount} · {total} orders
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-ink-200 px-3 py-1 disabled:opacity-40"
              >
                Previous
              </button>
              <button
                type="button"
                disabled={page >= pageCount}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-ink-200 px-3 py-1 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}

      {detail || detailLoading ? (
        <div className="fixed inset-0 z-40 flex justify-end bg-ink-950/40">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setDetail(null)}
          />
          <aside className="relative z-10 flex h-full w-full max-w-md flex-col overflow-y-auto bg-white shadow-xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-ink-100 bg-white px-4 py-3">
              <h2 className="font-semibold text-ink-950">
                {detail ? `Order #${detail.order.id}` : "Order"}
              </h2>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="text-sm text-ink-500"
              >
                Close
              </button>
            </div>
            <div className="space-y-4 p-4">
              {detailLoading && !detail ? (
                <p className="text-sm text-ink-500">Loading…</p>
              ) : detail ? (
                <>
                  <div className="flex flex-wrap gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs capitalize ${paymentBadgeClass(detail.order.paymentStatus)}`}
                    >
                      {detail.order.paymentStatus}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs capitalize ${orderBadgeClass(detail.order.orderStatus)}`}
                    >
                      {detail.order.orderStatus.replace(/_/g, " ")}
                    </span>
                  </div>

                  <div>
                    <p className="text-lg font-semibold">
                      {detail.order.customerName}
                    </p>
                    <p className="text-sm text-ink-600">
                      {detail.order.customerEmail}
                    </p>
                    <p className="text-sm text-ink-600">
                      {detail.order.customerPhone}
                    </p>
                    {contact ? (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {contact.tel ? (
                          <a
                            href={contact.tel}
                            className="rounded-lg border border-ink-200 px-2 py-1 text-xs"
                          >
                            Call
                          </a>
                        ) : null}
                        {contact.whatsapp ? (
                          <a
                            href={contact.whatsapp}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg border border-ink-200 px-2 py-1 text-xs"
                          >
                            WhatsApp
                          </a>
                        ) : null}
                        {contact.mailto ? (
                          <a
                            href={contact.mailto}
                            className="rounded-lg border border-ink-200 px-2 py-1 text-xs"
                          >
                            Email
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-sm text-ink-600">
                    <p>
                      <span className="text-ink-400">Address: </span>
                      {detail.order.deliveryAddress || "—"}
                    </p>
                    {detail.order.note ? (
                      <p className="mt-1">
                        <span className="text-ink-400">Customer note: </span>
                        {detail.order.note}
                      </p>
                    ) : null}
                    <p className="mt-1">
                      <span className="text-ink-400">Reference: </span>
                      {detail.order.paymentReference || "—"}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      Created {formatWhen(detail.order.createdAt)} · Updated{" "}
                      {formatWhen(detail.order.updatedAt)}
                    </p>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">Items</h3>
                    <ul className="mt-2 space-y-1">
                      {detail.items.map((it, i) => (
                        <li
                          key={i}
                          className="flex justify-between text-sm text-ink-700"
                        >
                          <span>
                            {it.productNameSnapshot} ×{it.quantity}
                          </span>
                          <span className="tabular-nums">
                            {formatNgn(it.lineTotalKobo)}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 space-y-1 border-t border-ink-100 pt-2 text-sm">
                      <div className="flex justify-between text-ink-600">
                        <span>Subtotal</span>
                        <span className="tabular-nums">
                          {formatNgn(detail.order.subtotalKobo || 0)}
                        </span>
                      </div>
                      {(detail.order.discountKobo || 0) > 0 ? (
                        <div className="flex justify-between text-ink-600">
                          <span>
                            Discount
                            {detail.order.couponCode
                              ? ` (${detail.order.couponCode})`
                              : ""}
                          </span>
                          <span className="tabular-nums">
                            −{formatNgn(detail.order.discountKobo || 0)}
                          </span>
                        </div>
                      ) : null}
                      <div className="flex justify-between font-semibold">
                        <span>Total</span>
                        <span className="tabular-nums">
                          {formatNgn(detail.order.totalKobo)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">Update status</h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {nextActions(
                        detail.order.orderStatus,
                        detail.order.paymentStatus
                      ).map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={busy}
                          onClick={() => void updateStatus(detail.order.id, s)}
                          className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium capitalize disabled:opacity-50"
                        >
                          {s}
                        </button>
                      ))}
                      {nextActions(
                        detail.order.orderStatus,
                        detail.order.paymentStatus
                      ).length === 0 ? (
                        <p className="text-xs text-ink-400">
                          No further status changes available
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div>
                    <h3 className="text-sm font-semibold">Seller note</h3>
                    <textarea
                      value={sellerNoteDraft}
                      onChange={(e) => setSellerNoteDraft(e.target.value)}
                      maxLength={2000}
                      className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                      rows={3}
                      placeholder="Internal note (not visible to customer)"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveSellerNote()}
                      className="mt-2 rounded-lg bg-ink-900 px-3 py-1.5 text-xs font-medium text-white"
                    >
                      Save note
                    </button>
                  </div>

                  <Link
                    href={`/dashboard/orders/${detail.order.id}/print`}
                    target="_blank"
                    className="inline-block rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-800"
                  >
                    Print invoice
                  </Link>
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </div>
  );
}
