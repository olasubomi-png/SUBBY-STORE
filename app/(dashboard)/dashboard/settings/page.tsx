"use client";

import { useEffect, useState } from "react";

type Store = {
  id: number;
  name: string;
  slug: string;
  description: string;
  logoUrl: string | null;
  bannerUrl: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  twitterUrl: string | null;
  tiktokUrl: string | null;
};

export default function SettingsPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "banner" | null>(null);

  async function load() {
    const d = await fetch("/api/dashboard").then((r) => r.json());
    setStore(d.stores?.[0] || null);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!store || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId: store.id,
          name: store.name,
          description: store.description,
          phone: store.phone,
          whatsapp: store.whatsapp,
          email: store.email,
          address: store.address,
          instagramUrl: store.instagramUrl,
          facebookUrl: store.facebookUrl,
          twitterUrl: store.twitterUrl,
          tiktokUrl: store.tiktokUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setStore({ ...store, ...data.store });
      setSuccess("Store settings saved");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function uploadImage(kind: "logo" | "banner", file: File) {
    if (!store) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPG, PNG, and WebP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5MB or smaller");
      return;
    }
    setUploading(kind);
    setError("");
    setSuccess("");
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      form.append("storeId", String(store.id));
      const up = await fetch("/api/uploads/store", {
        method: "POST",
        body: form,
      });
      const upData = await up.json();
      if (!up.ok) throw new Error(upData.error || "Upload failed");

      const field = kind === "logo" ? "logoUrl" : "bannerUrl";
      const res = await fetch("/api/stores", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ storeId: store.id, [field]: upData.url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save image");
      setStore({ ...store, ...data.store });
      setSuccess(kind === "logo" ? "Logo updated" : "Banner updated");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function removeImage(kind: "logo" | "banner") {
    if (!store) return;
    if (!confirm(`Remove store ${kind}?`)) return;
    setError("");
    const field = kind === "logo" ? "logoUrl" : "bannerUrl";
    const res = await fetch("/api/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ storeId: store.id, [field]: null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setStore({ ...store, ...data.store });
    setSuccess(kind === "logo" ? "Logo removed" : "Banner removed");
  }

  function copyLink() {
    if (!store) return;
    const url = `${window.location.origin}/store/${store.slug}`;
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!store) {
    return <p className="text-sm text-ink-500">No store configured.</p>;
  }

  const publicPath = `/store/${store.slug}`;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-ink-950">Store settings</h1>

      {(error || success) && (
        <p
          className={`text-sm ${error ? "text-red-600" : "text-brand-700"}`}
          role="status"
        >
          {error || success}
        </p>
      )}

      <div className="rounded-xl border border-ink-100 bg-white p-4">
        <p className="text-xs uppercase tracking-wide text-ink-400">Your store</p>
        <p className="mt-1 break-all font-medium text-brand-700">{publicPath}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm"
          >
            {copied ? "Copied" : "Copy link"}
          </button>
          <a
            href={publicPath}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm text-white"
          >
            View store
          </a>
        </div>
      </div>

      <section className="space-y-3 rounded-xl border border-ink-100 bg-white p-4">
        <h2 className="text-sm font-semibold text-ink-900">Branding</h2>
        <div className="space-y-2">
          <p className="text-xs text-ink-500">Logo</p>
          <div className="flex items-center gap-3">
            <div className="h-16 w-16 overflow-hidden rounded-full bg-ink-100">
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={store.logoUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : null}
            </div>
            <label className="cursor-pointer rounded-md border border-ink-200 px-2.5 py-1.5 text-xs">
              {uploading === "logo" ? "Uploading…" : "Replace logo"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage("logo", f);
                  e.target.value = "";
                }}
              />
            </label>
            {store.logoUrl ? (
              <button
                type="button"
                onClick={() => removeImage("logo")}
                className="text-xs text-red-600"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs text-ink-500">Banner</p>
          <div className="aspect-[3/1] w-full overflow-hidden rounded-lg bg-ink-100">
            {store.bannerUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.bannerUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-xs text-ink-400">
                No banner
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <label className="cursor-pointer rounded-md border border-ink-200 px-2.5 py-1.5 text-xs">
              {uploading === "banner" ? "Uploading…" : "Replace banner"}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                disabled={!!uploading}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadImage("banner", f);
                  e.target.value = "";
                }}
              />
            </label>
            {store.bannerUrl ? (
              <button
                type="button"
                onClick={() => removeImage("banner")}
                className="text-xs text-red-600"
              >
                Remove
              </button>
            ) : null}
          </div>
        </div>
      </section>

      <form
        onSubmit={save}
        className="space-y-3 rounded-xl border border-ink-100 bg-white p-4"
      >
        <h2 className="text-sm font-semibold text-ink-900">Store identity</h2>
        <label className="block text-sm">
          Name
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={store.name}
            onChange={(e) => setStore({ ...store, name: e.target.value })}
            required
            maxLength={120}
          />
        </label>
        <label className="block text-sm">
          Description
          <textarea
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            rows={3}
            value={store.description || ""}
            onChange={(e) =>
              setStore({ ...store, description: e.target.value })
            }
            maxLength={2000}
          />
        </label>

        <h2 className="pt-2 text-sm font-semibold text-ink-900">Contact</h2>
        <label className="block text-sm">
          Phone
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={store.phone || ""}
            onChange={(e) => setStore({ ...store, phone: e.target.value })}
            maxLength={32}
          />
        </label>
        <label className="block text-sm">
          WhatsApp
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={store.whatsapp || ""}
            onChange={(e) => setStore({ ...store, whatsapp: e.target.value })}
            maxLength={32}
          />
        </label>
        <label className="block text-sm">
          Email
          <input
            type="email"
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={store.email || ""}
            onChange={(e) => setStore({ ...store, email: e.target.value })}
            maxLength={255}
          />
        </label>
        <label className="block text-sm">
          Address
          <textarea
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            rows={2}
            value={store.address || ""}
            onChange={(e) => setStore({ ...store, address: e.target.value })}
            maxLength={500}
          />
        </label>

        <h2 className="pt-2 text-sm font-semibold text-ink-900">Social</h2>
        {(
          [
            ["instagramUrl", "Instagram"],
            ["facebookUrl", "Facebook"],
            ["twitterUrl", "X / Twitter"],
            ["tiktokUrl", "TikTok"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="block text-sm">
            {label}
            <input
              type="url"
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
              placeholder="https://"
              value={store[key] || ""}
              onChange={(e) => setStore({ ...store, [key]: e.target.value })}
              maxLength={500}
            />
          </label>
        ))}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
