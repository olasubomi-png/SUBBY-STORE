"use client";

import { useEffect, useState } from "react";

export default function SettingsPage() {
  const [store, setStore] = useState<{
    id: number;
    name: string;
    slug: string;
    description: string;
    phone: string | null;
    whatsapp: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d) => setStore(d.stores?.[0] || null));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!store) return;
    await fetch("/api/stores", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(store),
    });
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
      <h1 className="text-2xl font-semibold">Store settings</h1>

      <div className="rounded-xl border border-ink-100 bg-white p-4">
        <p className="text-xs uppercase text-ink-400">Your store</p>
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

      <form onSubmit={save} className="space-y-3 rounded-xl border border-ink-100 bg-white p-4">
        <label className="block text-sm">
          Name
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={store.name}
            onChange={(e) => setStore({ ...store, name: e.target.value })}
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
          />
        </label>
        <label className="block text-sm">
          Phone
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={store.phone || ""}
            onChange={(e) => setStore({ ...store, phone: e.target.value })}
          />
        </label>
        <label className="block text-sm">
          WhatsApp
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={store.whatsapp || ""}
            onChange={(e) => setStore({ ...store, whatsapp: e.target.value })}
          />
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
        >
          Save changes
        </button>
      </form>
    </div>
  );
}
