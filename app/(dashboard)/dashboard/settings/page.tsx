"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { shareOrCopy } from "@/lib/storefront/share";

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
  seoTitle: string | null;
  seoDescription: string | null;
  seoKeywords: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
};

function field(
  label: string,
  value: string,
  onChange: (v: string) => void,
  opts?: {
    multiline?: boolean;
    maxLength?: number;
    placeholder?: string;
    type?: string;
    hint?: string;
  }
) {
  const common =
    "mt-1 w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-900";
  return (
    <label className="block text-sm">
      <span className="font-medium text-ink-700">{label}</span>
      {opts?.hint ? (
        <span className="mt-0.5 block text-xs text-ink-400">{opts.hint}</span>
      ) : null}
      {opts?.multiline ? (
        <textarea
          className={`${common} min-h-[88px]`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={opts.maxLength}
          placeholder={opts.placeholder}
        />
      ) : (
        <input
          type={opts?.type || "text"}
          className={common}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={opts?.maxLength}
          placeholder={opts?.placeholder}
        />
      )}
    </label>
  );
}

export default function SettingsPage() {
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "banner" | "og" | null>(
    null
  );
  const [shareMsg, setShareMsg] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/dashboard", {
        credentials: "include",
        cache: "no-store",
      });
      const d = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Your session has expired. Please log in again.");
        setStore(null);
        return;
      }
      if (!res.ok) {
        setError(d.error || "Could not load store");
        return;
      }
      const s = d.stores?.[0] || null;
      setStore(
        s
          ? {
              ...s,
              seoTitle: s.seoTitle ?? null,
              seoDescription: s.seoDescription ?? null,
              seoKeywords: s.seoKeywords ?? null,
              ogTitle: s.ogTitle ?? null,
              ogDescription: s.ogDescription ?? null,
              ogImageUrl: s.ogImageUrl ?? null,
            }
          : null
      );
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function patch(partial: Partial<Store>) {
    setStore((prev) => (prev ? { ...prev, ...partial } : prev));
  }

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
        credentials: "include",
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
          logoUrl: store.logoUrl,
          bannerUrl: store.bannerUrl,
          seoTitle: store.seoTitle,
          seoDescription: store.seoDescription,
          seoKeywords: store.seoKeywords,
          ogTitle: store.ogTitle,
          ogDescription: store.ogDescription,
          ogImageUrl: store.ogImageUrl,
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

  async function uploadImage(kind: "logo" | "banner" | "og", file: File) {
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
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("storeId", String(store.id));
      fd.set("kind", kind === "og" ? "banner" : kind);
      const res = await fetch("/api/uploads/store", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      const url = data.url as string;
      if (kind === "logo") patch({ logoUrl: url });
      else if (kind === "banner") patch({ bannerUrl: url });
      else patch({ ogImageUrl: url });
      setSuccess(
        kind === "logo"
          ? "Logo uploaded — save to apply"
          : kind === "banner"
            ? "Banner uploaded — save to apply"
            : "Share image uploaded — save to apply"
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(null);
    }
  }

  async function shareStore() {
    if (!store) return;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/store/${store.slug}`
        : `/store/${store.slug}`;
    const result = await shareOrCopy({
      title: store.seoTitle || store.name,
      text: store.seoDescription || store.description || `Shop ${store.name}`,
      url,
    });
    setShareMsg(
      result === "shared"
        ? "Shared"
        : result === "copied"
          ? "Store link copied"
          : "Could not share"
    );
    setTimeout(() => setShareMsg(""), 2500);
  }

  if (loading) {
    return (
      <div className="p-4 sm:p-6">
        <p className="text-sm text-ink-500">Loading store settings…</p>
      </div>
    );
  }

  if (!store) {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-xl font-semibold text-ink-950">Store settings</h1>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <p className="mt-3 text-sm text-ink-600">
          Create a store first to manage branding and SEO.
        </p>
        <Link
          href="/dashboard/new-store"
          className="mt-4 inline-block text-sm font-medium text-brand-700"
        >
          Create store
        </Link>
      </div>
    );
  }

  const publicUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/store/${store.slug}`
      : `/store/${store.slug}`;

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-950">Store settings</h1>
          <p className="mt-1 text-sm text-ink-500">
            Branding, contact details, and how your store appears when shared.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/store/${store.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800"
          >
            Preview store
          </Link>
          <button
            type="button"
            onClick={() => void shareStore()}
            className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800"
          >
            Share store
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-ink-100 bg-ink-50 px-3 py-2 text-sm text-ink-700">
        <span className="text-ink-400">Public URL · </span>
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-brand-700 break-all"
        >
          /store/{store.slug}
        </a>
        {shareMsg ? (
          <span className="ml-2 text-xs text-brand-700">{shareMsg}</span>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {success}
        </p>
      ) : null}

      <form onSubmit={save} className="space-y-8">
        <section className="space-y-3 rounded-2xl border border-ink-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-ink-900">Appearance</h2>
          {field("Store name", store.name, (v) => patch({ name: v }), {
            maxLength: 120,
          })}
          {field(
            "Description",
            store.description || "",
            (v) => patch({ description: v }),
            { multiline: true, maxLength: 2000 }
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-sm font-medium text-ink-700">Logo</p>
              {store.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={store.logoUrl}
                  alt=""
                  className="mt-2 h-16 w-16 rounded-lg object-cover"
                />
              ) : (
                <p className="mt-2 text-xs text-ink-400">No logo yet</p>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-2 block w-full text-xs"
                disabled={uploading !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage("logo", f);
                }}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-ink-700">Banner</p>
              {store.bannerUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={store.bannerUrl}
                  alt=""
                  className="mt-2 h-16 w-full max-w-xs rounded-lg object-cover"
                />
              ) : (
                <p className="mt-2 text-xs text-ink-400">No banner yet</p>
              )}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="mt-2 block w-full text-xs"
                disabled={uploading !== null}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void uploadImage("banner", f);
                }}
              />
            </div>
          </div>
          {uploading ? (
            <p className="text-xs text-ink-500">Uploading {uploading}…</p>
          ) : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-ink-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-ink-900">Contact</h2>
          {field("Phone", store.phone || "", (v) => patch({ phone: v }), {
            maxLength: 32,
          })}
          {field(
            "WhatsApp",
            store.whatsapp || "",
            (v) => patch({ whatsapp: v }),
            { maxLength: 32, placeholder: "2348012345678" }
          )}
          {field("Email", store.email || "", (v) => patch({ email: v }), {
            type: "email",
            maxLength: 255,
          })}
          {field(
            "Address",
            store.address || "",
            (v) => patch({ address: v }),
            { multiline: true, maxLength: 500 }
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-ink-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-ink-900">Social links</h2>
          {(
            [
              ["instagramUrl", "Instagram URL"],
              ["facebookUrl", "Facebook URL"],
              ["twitterUrl", "Twitter / X URL"],
              ["tiktokUrl", "TikTok URL"],
            ] as const
          ).map(([key, label]) =>
            field(label, store[key] || "", (v) => patch({ [key]: v }), {
              maxLength: 500,
              placeholder: "https://",
            })
          )}
        </section>

        <section className="space-y-3 rounded-2xl border border-ink-100 bg-white p-4">
          <h2 className="text-sm font-semibold text-ink-900">
            SEO & link previews
          </h2>
          <p className="text-xs text-ink-500">
            Controls search results and how your store looks when shared on
            WhatsApp, X, or Facebook. Leave blank to use your store name and
            description.
          </p>
          {field(
            "SEO title",
            store.seoTitle || "",
            (v) => patch({ seoTitle: v }),
            { maxLength: 70, hint: "Up to 70 characters" }
          )}
          {field(
            "SEO description",
            store.seoDescription || "",
            (v) => patch({ seoDescription: v }),
            { multiline: true, maxLength: 160, hint: "Up to 160 characters" }
          )}
          {field(
            "Keywords",
            store.seoKeywords || "",
            (v) => patch({ seoKeywords: v }),
            {
              maxLength: 255,
              placeholder: "fashion, lagos, thrift",
              hint: "Comma-separated",
            }
          )}
          {field(
            "Social title",
            store.ogTitle || "",
            (v) => patch({ ogTitle: v }),
            { maxLength: 70 }
          )}
          {field(
            "Social description",
            store.ogDescription || "",
            (v) => patch({ ogDescription: v }),
            { multiline: true, maxLength: 160 }
          )}
          <div>
            <p className="text-sm font-medium text-ink-700">Social image</p>
            <p className="text-xs text-ink-400">
              Used for link previews. Falls back to banner or logo.
            </p>
            {store.ogImageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.ogImageUrl}
                alt=""
                className="mt-2 h-20 w-full max-w-sm rounded-lg object-cover"
              />
            ) : null}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="mt-2 block w-full text-xs"
              disabled={uploading !== null}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadImage("og", f);
              }}
            />
          </div>
        </section>

        <button
          type="submit"
          disabled={saving || uploading !== null}
          className="w-full rounded-lg bg-brand-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 sm:w-auto"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}
