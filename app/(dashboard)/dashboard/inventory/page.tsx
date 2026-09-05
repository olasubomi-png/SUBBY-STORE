"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatNgn } from "@/lib/money";
import { LOW_STOCK_THRESHOLD } from "@/lib/inventory";

type InventoryProduct = {
  id: number;
  storeId: number;
  storeName?: string;
  name: string;
  stock: number;
  priceKobo: number;
  active: boolean;
  category?: string;
  imageUrl?: string | null;
};

type StockFilter = "all" | "in" | "low" | "out";

function statusOf(stock: number): StockFilter {
  if (stock <= 0) return "out";
  if (stock <= LOW_STOCK_THRESHOLD) return "low";
  return "in";
}

function statusLabel(s: StockFilter): string {
  switch (s) {
    case "out":
      return "Out of stock";
    case "low":
      return "Low stock";
    case "in":
      return "In stock";
    default:
      return "All";
  }
}

function statusClass(s: StockFilter): string {
  switch (s) {
    case "out":
      return "bg-red-50 text-red-700";
    case "low":
      return "bg-amber-50 text-amber-800";
    case "in":
      return "bg-emerald-50 text-emerald-800";
    default:
      return "bg-ink-100 text-ink-600";
  }
}

export default function InventoryPage() {
  const [products, setProducts] = useState<InventoryProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<StockFilter>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<number, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inventory", {
        credentials: "include",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Your session has expired. Please log in again.");
        setProducts([]);
        return;
      }
      if (!res.ok) {
        setError(
          typeof body.error === "string"
            ? body.error
            : `Could not load inventory (${res.status})`
        );
        setProducts([]);
        return;
      }
      const list = Array.isArray(body.products) ? body.products : [];
      setProducts(list);
      const nextDrafts: Record<number, string> = {};
      for (const p of list) {
        nextDrafts[p.id] = String(p.stock);
      }
      setDrafts(nextDrafts);
    } catch {
      setError("Network error. Check your connection and try again.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const total = products.length;
    const out = products.filter((p) => p.stock <= 0).length;
    const low = products.filter(
      (p) => p.stock > 0 && p.stock <= LOW_STOCK_THRESHOLD
    ).length;
    const units = products.reduce((s, p) => s + Math.max(0, p.stock), 0);
    return { total, out, low, units };
  }, [products]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      const st = statusOf(p.stock);
      if (filter !== "all" && st !== filter) return false;
      if (!q) return true;
      const hay = [p.name, p.category, p.storeName, String(p.id)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [products, query, filter]);

  async function adjust(
    productId: number,
    mode: "set" | "delta",
    value: number
  ) {
    setBusyId(productId);
    setActionError(null);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, mode, value }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof body.error === "string" ? body.error : "Update failed"
        );
      }
      const updated = body.product as InventoryProduct;
      setProducts((prev) =>
        prev.map((p) =>
          p.id === productId
            ? {
                ...p,
                stock: updated.stock,
              }
            : p
        )
      );
      setDrafts((d) => ({ ...d, [productId]: String(updated.stock) }));
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Update failed");
      await load();
    } finally {
      setBusyId(null);
    }
  }

  function applyExact(productId: number) {
    const raw = drafts[productId];
    const n = Number(raw);
    if (!Number.isSafeInteger(n) || n < 0) {
      setActionError("Enter a whole number of 0 or more");
      return;
    }
    void adjust(productId, "set", n);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-950">Inventory</h1>
          <p className="mt-1 text-sm text-ink-500">
            Monitor stock levels and adjust quantities safely.
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
          { label: "Products", value: String(kpis.total) },
          { label: "Units on hand", value: String(kpis.units) },
          { label: "Low stock", value: String(kpis.low) },
          { label: "Out of stock", value: String(kpis.out) },
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
            placeholder="Search by name, category, or store…"
            className="w-full rounded-lg border border-ink-200 px-3 py-2.5 pr-16 text-sm text-ink-900 placeholder:text-ink-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            aria-label="Search inventory"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-ink-500"
            >
              Clear
            </button>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {(
            [
              ["all", "All"],
              ["in", "In stock"],
              ["low", "Low stock"],
              ["out", "Out of stock"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setFilter(value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                filter === value
                  ? "bg-brand-50 text-brand-800"
                  : "bg-ink-50 text-ink-600 hover:bg-ink-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-400">
          Showing {filtered.length} of {products.length} · Low stock ≤{" "}
          {LOW_STOCK_THRESHOLD} units
        </p>
      </div>

      {actionError ? (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {actionError}
        </p>
      ) : null}

      {loading && products.length === 0 ? (
        <p className="text-sm text-ink-500">Loading inventory…</p>
      ) : error ? (
        <div className="rounded-xl border border-ink-100 bg-white p-6 text-center">
          <p className="font-medium text-ink-900">Could not load inventory</p>
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
            {products.length === 0 ? "No products yet" : "No matching products"}
          </p>
          <p className="mt-1 text-sm text-ink-500">
            {products.length === 0
              ? "Add products from the Products page to manage inventory."
              : "Try a different search or filter."}
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-hidden rounded-xl border border-ink-100 bg-white md:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-ink-100 bg-ink-50 text-xs uppercase tracking-wide text-ink-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Product</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Price</th>
                  <th className="px-4 py-3 font-medium">Stock</th>
                  <th className="px-4 py-3 font-medium">Adjust</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {filtered.map((p) => {
                  const st = statusOf(p.stock);
                  const busy = busyId === p.id;
                  return (
                    <tr key={p.id} className="hover:bg-ink-50/60">
                      <td className="px-4 py-3">
                        <p className="font-medium text-ink-900">{p.name}</p>
                        <p className="text-xs text-ink-400">
                          {p.storeName || `Store #${p.storeId}`}
                          {p.category ? ` · ${p.category}` : ""}
                          {!p.active ? " · Inactive" : ""}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(st)}`}
                        >
                          {statusLabel(st)}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-ink-800">
                        {formatNgn(p.priceKobo)}
                      </td>
                      <td className="px-4 py-3 font-semibold tabular-nums text-ink-950">
                        {p.stock}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            disabled={busy || p.stock <= 0}
                            onClick={() => void adjust(p.id, "delta", -1)}
                            className="h-8 w-8 rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                            aria-label="Decrease stock"
                          >
                            −
                          </button>
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={drafts[p.id] ?? String(p.stock)}
                            onChange={(e) =>
                              setDrafts((d) => ({
                                ...d,
                                [p.id]: e.target.value,
                              }))
                            }
                            className="w-16 rounded-md border border-ink-200 px-2 py-1.5 text-center text-sm tabular-nums"
                            aria-label={`Set stock for ${p.name}`}
                          />
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void adjust(p.id, "delta", 1)}
                            className="h-8 w-8 rounded-md border border-ink-200 text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                            aria-label="Increase stock"
                          >
                            +
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => applyExact(p.id)}
                            className="rounded-md border border-ink-200 px-2 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:opacity-40"
                          >
                            {busy ? "…" : "Set"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <ul className="space-y-3 md:hidden">
            {filtered.map((p) => {
              const st = statusOf(p.stock);
              const busy = busyId === p.id;
              return (
                <li
                  key={p.id}
                  className="rounded-xl border border-ink-100 bg-white p-4 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-ink-900">{p.name}</p>
                      <p className="text-xs text-ink-400">
                        {p.storeName || `Store #${p.storeId}`} ·{" "}
                        {formatNgn(p.priceKobo)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusClass(st)}`}
                    >
                      {statusLabel(st)}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-ink-500">
                    On hand:{" "}
                    <span className="font-semibold tabular-nums text-ink-900">
                      {p.stock}
                    </span>
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={busy || p.stock <= 0}
                      onClick={() => void adjust(p.id, "delta", -1)}
                      className="h-9 w-9 rounded-md border border-ink-200 text-ink-700 disabled:opacity-40"
                      aria-label="Decrease stock"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={drafts[p.id] ?? String(p.stock)}
                      onChange={(e) =>
                        setDrafts((d) => ({ ...d, [p.id]: e.target.value }))
                      }
                      className="w-20 rounded-md border border-ink-200 px-2 py-2 text-center text-sm tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void adjust(p.id, "delta", 1)}
                      className="h-9 w-9 rounded-md border border-ink-200 text-ink-700 disabled:opacity-40"
                      aria-label="Increase stock"
                    >
                      +
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => applyExact(p.id)}
                      className="rounded-md border border-ink-200 px-3 py-2 text-xs font-medium text-ink-700 disabled:opacity-40"
                    >
                      {busy ? "…" : "Set"}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
