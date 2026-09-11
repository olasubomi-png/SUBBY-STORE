"use client";

import { useEffect, useMemo, useState } from "react";
import { formatNgn, koboToNgnMajor } from "@/lib/money";

type Coupon = {
  id: number;
  code: string;
  type: string;
  value: number;
  minimumOrderAmount: number;
  maximumDiscountAmount: number | null;
  startsAt: string | null;
  expiresAt: string | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  active: boolean;
  productIds?: number[];
};

type Product = { id: number; name: string };

const blank = () => ({
  code: "",
  type: "percentage" as "percentage" | "fixed",
  value: "10",
  minimumOrderAmountNgn: "0",
  maximumDiscountAmountNgn: "",
  startsAt: "",
  expiresAt: "",
  usageLimit: "",
  perCustomerLimit: "",
  active: true,
  productIds: [] as number[],
});

export default function CouponsPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(blank());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "active" | "inactive">("all");

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/coupons", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setStoreId(data.storeId ?? null);
      setCoupons(Array.isArray(data.coupons) ? data.coupons : []);
      if (data.storeId) {
        const pr = await fetch(`/api/products?storeId=${data.storeId}`, {
          credentials: "include",
        });
        const pd = await pr.json().catch(() => ({}));
        setProducts(
          Array.isArray(pd.products)
            ? pd.products.map((p: { id: number; name: string }) => ({
                id: p.id,
                name: p.name,
              }))
            : []
        );
      }
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return coupons.filter((c) => {
      if (q && !c.code.toLowerCase().includes(q)) return false;
      if (filter === "active" && !c.active) return false;
      if (filter === "inactive" && c.active) return false;
      return true;
    });
  }, [coupons, search, filter]);

  async function createCoupon(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          storeId,
          code: form.code,
          type: form.type,
          value: Number(form.value),
          minimumOrderAmountNgn: Number(form.minimumOrderAmountNgn) || 0,
          maximumDiscountAmountNgn:
            form.maximumDiscountAmountNgn === ""
              ? null
              : Number(form.maximumDiscountAmountNgn),
          startsAt: form.startsAt
            ? new Date(form.startsAt).toISOString()
            : null,
          expiresAt: form.expiresAt
            ? new Date(form.expiresAt).toISOString()
            : null,
          usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
          perCustomerLimit: form.perCustomerLimit
            ? Number(form.perCustomerLimit)
            : null,
          active: form.active,
          productIds: form.productIds,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Create failed");
      setSuccess(`Coupon ${data.coupon?.code || ""} created`);
      setForm(blank());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(c: Coupon) {
    const res = await fetch("/api/coupons", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ couponId: c.id, active: !c.active }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Update failed");
      return;
    }
    setSuccess(c.active ? "Deactivated" : "Activated");
    await load();
  }

  async function remove(c: Coupon) {
    if (!confirm(`Delete coupon ${c.code}?`)) return;
    const res = await fetch(`/api/coupons?couponId=${c.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "Delete failed");
      return;
    }
    setSuccess("Deleted");
    await load();
  }

  function statusLabel(c: Coupon) {
    const now = Date.now();
    if (!c.active) return "Inactive";
    if (c.expiresAt && new Date(c.expiresAt).getTime() < now) return "Expired";
    if (c.startsAt && new Date(c.startsAt).getTime() > now) return "Scheduled";
    if (c.usageLimit != null && c.usageCount >= c.usageLimit) return "Exhausted";
    return "Active";
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-ink-100" />
        <div className="h-32 animate-pulse rounded-xl bg-ink-100" />
      </div>
    );
  }

  if (!storeId) {
    return (
      <p className="text-sm text-ink-500">Create a store first to manage coupons.</p>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink-950">Coupons</h1>
      {(error || success) && (
        <p
          className={`text-sm ${error ? "text-red-600" : "text-brand-700"}`}
          role="status"
        >
          {error || success}
        </p>
      )}

      <form
        onSubmit={createCoupon}
        className="space-y-3 rounded-xl border border-ink-100 bg-white p-4"
      >
        <p className="text-sm font-medium text-ink-800">Create coupon</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="block text-sm">
            Code
            <input
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm uppercase"
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
              required
              maxLength={40}
            />
          </label>
          <label className="block text-sm">
            Type
            <select
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={form.type}
              onChange={(e) =>
                setForm({
                  ...form,
                  type: e.target.value as "percentage" | "fixed",
                })
              }
            >
              <option value="percentage">Percentage</option>
              <option value="fixed">Fixed (NGN)</option>
            </select>
          </label>
          <label className="block text-sm">
            Value {form.type === "percentage" ? "(%)" : "(NGN)"}
            <input
              type="number"
              min="1"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
              required
            />
          </label>
          <label className="block text-sm">
            Min. order (NGN)
            <input
              type="number"
              min="0"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={form.minimumOrderAmountNgn}
              onChange={(e) =>
                setForm({ ...form, minimumOrderAmountNgn: e.target.value })
              }
            />
          </label>
          <label className="block text-sm">
            Max discount (NGN, optional)
            <input
              type="number"
              min="0"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={form.maximumDiscountAmountNgn}
              onChange={(e) =>
                setForm({ ...form, maximumDiscountAmountNgn: e.target.value })
              }
              placeholder="No cap"
            />
          </label>
          <label className="block text-sm">
            Usage limit
            <input
              type="number"
              min="1"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={form.usageLimit}
              onChange={(e) => setForm({ ...form, usageLimit: e.target.value })}
              placeholder="Unlimited"
            />
          </label>
          <label className="block text-sm">
            Per-customer limit
            <input
              type="number"
              min="1"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={form.perCustomerLimit}
              onChange={(e) =>
                setForm({ ...form, perCustomerLimit: e.target.value })
              }
              placeholder="Unlimited"
            />
          </label>
          <label className="block text-sm">
            Starts
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            Expires
            <input
              type="datetime-local"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </label>
        </div>
        <div>
          <p className="text-sm text-ink-600">
            Product-specific (optional — leave empty for store-wide)
          </p>
          <div className="mt-1 flex max-h-32 flex-wrap gap-2 overflow-y-auto rounded-lg border border-ink-100 p-2">
            {products.length === 0 ? (
              <span className="text-xs text-ink-400">No products</span>
            ) : (
              products.map((p) => {
                const checked = form.productIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    className="flex items-center gap-1 rounded-md border border-ink-100 px-2 py-1 text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => {
                        setForm({
                          ...form,
                          productIds: checked
                            ? form.productIds.filter((id) => id !== p.id)
                            : [...form.productIds, p.id],
                        });
                      }}
                    />
                    {p.name}
                  </label>
                );
              })
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Create coupon"}
        </button>
      </form>

      <div className="space-y-3 rounded-xl border border-ink-100 bg-white p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="block flex-1 text-xs text-ink-600">
            Search
            <input
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Code…"
            />
          </label>
          <label className="block text-xs text-ink-600">
            Status
            <select
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              value={filter}
              onChange={(e) =>
                setFilter(e.target.value as "all" | "active" | "inactive")
              }
            >
              <option value="all">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>
        </div>

        {filtered.length === 0 ? (
          <p className="text-sm text-ink-500">
            {coupons.length === 0
              ? "No coupons yet. Create your first discount above."
              : "No coupons match your filters."}
          </p>
        ) : (
          <ul className="space-y-2">
            {filtered.map((c) => (
              <li
                key={c.id}
                className="rounded-lg border border-ink-100 px-3 py-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-ink-900">{c.code}</p>
                    <p className="text-xs text-ink-500">
                      {c.type === "percentage"
                        ? `${c.value}% off`
                        : `${formatNgn(c.value)} off`}
                      {c.minimumOrderAmount > 0
                        ? ` · Min ${formatNgn(c.minimumOrderAmount)}`
                        : ""}
                      {" · "}
                      Used {c.usageCount}
                      {c.usageLimit != null ? `/${c.usageLimit}` : ""}
                      {" · "}
                      {statusLabel(c)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void toggleActive(c)}
                      className="rounded-md border border-ink-200 px-2 py-1 text-xs"
                    >
                      {c.active ? "Deactivate" : "Activate"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(c)}
                      className="rounded-md border border-red-200 px-2 py-1 text-xs text-red-600"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
