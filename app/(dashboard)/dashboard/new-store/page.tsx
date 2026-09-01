"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewStorePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [phone, setPhone] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/stores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, slug: slug || undefined, phone, whatsapp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <h1 className="text-2xl font-semibold">Create your store</h1>
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-ink-100 bg-white p-5">
        <label className="block text-sm">
          <span className="text-ink-700">Store name</span>
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-700">Slug (optional)</span>
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            placeholder="tola-fashion"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-700">Phone</span>
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-700">WhatsApp</span>
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-brand-600 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {loading ? "Creating…" : "Create store"}
        </button>
      </form>
    </div>
  );
}
