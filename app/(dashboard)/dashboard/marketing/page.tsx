"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { shareOrCopy } from "@/lib/storefront/share";

type Campaign = {
  id: number; name: string; slug: string; description: string; campaignType: string;
  status: string; effectiveStatus: string; startsAt: string | null; endsAt: string | null;
  bannerUrl: string | null; announcementText: string | null; couponId: number | null; productIds: number[];
};
type Coupon = { id: number; code: string; active: boolean };
type Product = { id: number; name: string; active: boolean };
const TYPES = [
  { value: "announcement", label: "Store announcement" },
  { value: "featured_products", label: "Featured products" },
  { value: "coupon_promotion", label: "Coupon promotion" },
  { value: "seasonal_sale", label: "Seasonal sale" },
  { value: "limited_offer", label: "Limited-time offer" },
] as const;
const blank = () => ({
  name: "", description: "", campaignType: "announcement", status: "draft",
  startsAt: "", endsAt: "", bannerUrl: "", announcementText: "",
  couponId: "" as string | number, productIds: [] as number[],
});
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export default function MarketingPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [storeSlug, setStoreSlug] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [form, setForm] = useState(blank());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [filter, setFilter] = useState("all");
  const [shareMsg, setShareMsg] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/campaigns", { credentials: "include", cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to load");
      setStoreId(typeof data.storeId === "number" ? data.storeId : null);
      setStoreSlug(typeof data.storeSlug === "string" ? data.storeSlug : "");
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
      setError("");
      if (data.storeId) {
        const [cr, pr] = await Promise.all([
          fetch("/api/coupons", { credentials: "include", cache: "no-store" }),
          fetch(`/api/products?storeId=${data.storeId}`, { credentials: "include", cache: "no-store" }),
        ]);
        const cd = await cr.json().catch(() => ({}));
        const pd = await pr.json().catch(() => ({}));
        setCoupons(Array.isArray(cd.coupons) ? cd.coupons.map((c: Coupon) => ({ id: c.id, code: c.code, active: c.active })) : []);
        setProducts(Array.isArray(pd.products) ? pd.products.map((p: Product) => ({ id: p.id, name: p.name, active: p.active })) : []);
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const filtered = useMemo(() => campaigns.filter((c) => filter === "all" || (c.effectiveStatus || c.status) === filter), [campaigns, filter]);
  const kpis = useMemo(() => {
    const counts = { total: campaigns.length, active: 0, scheduled: 0, draft: 0 };
    for (const c of campaigns) {
      const s = c.effectiveStatus || c.status;
      if (s === "active") counts.active++;
      else if (s === "scheduled") counts.scheduled++;
      else if (s === "draft") counts.draft++;
    }
    return counts;
  }, [campaigns]);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setSuccess("");
    try {
      const payload = {
        name: form.name, description: form.description, campaignType: form.campaignType, status: form.status,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
        bannerUrl: form.bannerUrl || null, announcementText: form.announcementText || null,
        couponId: form.couponId === "" || form.couponId == null ? null : Number(form.couponId),
        productIds: form.productIds, storeId: storeId ?? undefined,
      };
      const res = await fetch("/api/campaigns", {
        method: editingId ? "PATCH" : "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId ? { id: editingId, ...payload } : payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSuccess(editingId ? "Campaign updated" : "Campaign created");
      setEditingId(null); setForm(blank());
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Save failed"); }
    finally { setSaving(false); }
  }
  async function setStatus(id: number, status: string) {
    try {
      const res = await fetch("/api/campaigns", { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, status }) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Update failed");
      setSuccess(`Campaign marked ${status}`);
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Update failed"); }
  }
  async function remove(id: number) {
    if (!confirm("Delete this draft campaign?")) return;
    try {
      const res = await fetch(`/api/campaigns?id=${id}`, { method: "DELETE", credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Delete failed");
      setSuccess("Draft deleted");
      await load();
    } catch (err) { setError(err instanceof Error ? err.message : "Delete failed"); }
  }
  async function shareCampaign(c: Campaign) {
    if (!storeSlug) return;
    const url = `${window.location.origin}/store/${storeSlug}/campaign/${c.slug}`;
    const result = await shareOrCopy({ title: c.name, text: c.announcementText || c.description || c.name, url });
    setShareMsg(result === "shared" ? "Shared" : result === "copied" ? "Link copied" : "Could not share");
    setTimeout(() => setShareMsg(""), 2500);
  }
  if (loading) return <div className="space-y-4"><h1 className="text-xl font-semibold">Marketing</h1><p className="text-sm text-ink-500">Loading…</p></div>;
  if (!storeId) return <div className="space-y-3"><h1 className="text-xl font-semibold">Marketing</h1><p className="rounded-xl border bg-white p-4 text-sm">Create a store first to run campaigns.</p></div>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-950">Marketing</h1>
          <p className="mt-1 text-sm text-ink-500">Promote your store with announcements, featured products, and coupon campaigns.</p>
        </div>
        <button type="button" onClick={() => void load()} className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm">Refresh</button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[{ label: "Total", value: kpis.total }, { label: "Active", value: kpis.active }, { label: "Scheduled", value: kpis.scheduled }, { label: "Drafts", value: kpis.draft }].map((k) => (
          <div key={k.label} className="rounded-xl border border-ink-100 bg-white p-3">
            <p className="text-xs text-ink-500">{k.label}</p>
            <p className="mt-1 text-lg font-semibold">{k.value}</p>
          </div>
        ))}
      </div>
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {success && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{success}</div>}
      {shareMsg && <div className="rounded-lg border bg-ink-50 px-3 py-2 text-sm">{shareMsg}</div>}
      <form onSubmit={submit} className="space-y-4 rounded-xl border border-ink-100 bg-white p-4">
        <h2 className="font-medium">{editingId ? "Edit campaign" : "Create campaign"}</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm"><span className="text-ink-600">Name</span>
            <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" maxLength={120} /></label>
          <label className="block text-sm"><span className="text-ink-600">Type</span>
            <select value={form.campaignType} onChange={(e) => setForm((f) => ({ ...f, campaignType: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2">
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select></label>
          <label className="block text-sm"><span className="text-ink-600">Status</span>
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2">
              <option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="active">Active</option><option value="paused">Paused</option>
              {editingId && <option value="expired">Expired</option>}
            </select></label>
          <label className="block text-sm"><span className="text-ink-600">Coupon</span>
            <select value={form.couponId === "" ? "" : String(form.couponId)} onChange={(e) => setForm((f) => ({ ...f, couponId: e.target.value ? Number(e.target.value) : "" }))} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2">
              <option value="">None</option>
              {coupons.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
            </select></label>
          <label className="block text-sm"><span className="text-ink-600">Starts</span>
            <input type="datetime-local" value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" /></label>
          <label className="block text-sm"><span className="text-ink-600">Ends</span>
            <input type="datetime-local" value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" /></label>
        </div>
        <label className="block text-sm"><span className="text-ink-600">Announcement</span>
          <textarea value={form.announcementText} onChange={(e) => setForm((f) => ({ ...f, announcementText: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" rows={2} maxLength={500} /></label>
        <label className="block text-sm"><span className="text-ink-600">Description</span>
          <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2" rows={3} maxLength={2000} /></label>
        <fieldset className="text-sm">
          <legend className="text-ink-600">Products</legend>
          <div className="mt-2 max-h-36 space-y-1 overflow-y-auto rounded-lg border border-ink-100 p-2">
            {products.map((p) => (
              <label key={p.id} className="flex items-center gap-2">
                <input type="checkbox" checked={form.productIds.includes(p.id)} onChange={(e) => setForm((f) => ({ ...f, productIds: e.target.checked ? [...f.productIds, p.id] : f.productIds.filter((id) => id !== p.id) }))} />
                <span>{p.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <button type="submit" disabled={saving} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{saving ? "Saving…" : editingId ? "Save changes" : "Create campaign"}</button>
          {editingId && <button type="button" onClick={() => { setEditingId(null); setForm(blank()); }} className="rounded-lg border border-ink-200 px-4 py-2 text-sm">Cancel</button>}
        </div>
      </form>
      <div className="flex flex-wrap gap-2">
        {["all", "active", "scheduled", "draft", "paused", "expired"].map((f) => (
          <button key={f} type="button" onClick={() => setFilter(f)} className={`rounded-full px-3 py-1 text-xs font-medium ${filter === f ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600"}`}>{f}</button>
        ))}
      </div>
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center text-sm text-ink-500">No campaigns yet.</div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((c) => {
            const st = c.effectiveStatus || c.status;
            return (
              <li key={c.id} className="rounded-xl border border-ink-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{c.name}</h3>
                      <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs">{st}</span>
                    </div>
                    <p className="mt-1 text-xs text-ink-400">/store/{storeSlug}/campaign/{c.slug}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => {
                      setEditingId(c.id);
                      setForm({
                        name: c.name, description: c.description || "", campaignType: c.campaignType, status: c.status,
                        startsAt: toLocalInput(c.startsAt), endsAt: toLocalInput(c.endsAt), bannerUrl: c.bannerUrl || "",
                        announcementText: c.announcementText || "", couponId: c.couponId ?? "", productIds: [...(c.productIds || [])],
                      });
                    }} className="rounded-lg border px-2.5 py-1 text-xs">Edit</button>
                    {st === "draft" && <>
                      <button type="button" onClick={() => void setStatus(c.id, "active")} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs text-white">Activate</button>
                      <button type="button" onClick={() => void remove(c.id)} className="rounded-lg border border-red-200 px-2.5 py-1 text-xs text-red-700">Delete</button>
                    </>}
                    {st === "active" && <button type="button" onClick={() => void setStatus(c.id, "paused")} className="rounded-lg border px-2.5 py-1 text-xs">Pause</button>}
                    {st === "paused" && <button type="button" onClick={() => void setStatus(c.id, "active")} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs text-white">Resume</button>}
                    {(st === "active" || st === "scheduled") && <button type="button" onClick={() => void setStatus(c.id, "expired")} className="rounded-lg border px-2.5 py-1 text-xs">End</button>}
                    <button type="button" onClick={() => void shareCampaign(c)} className="rounded-lg border px-2.5 py-1 text-xs">Share</button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
