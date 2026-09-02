"use client";

import { useEffect, useState } from "react";
import { formatNgn } from "@/lib/money";

type Product = {
  id: number;
  name: string;
  priceKobo: number;
  stock: number;
  active: boolean;
  imageUrl?: string | null;
};

export default function ProductsPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [priceNgn, setPriceNgn] = useState("");
  const [stock, setStock] = useState("10");
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const d = await fetch("/api/dashboard").then((r) => r.json());
    const sid = d.stores?.[0]?.id;

    if (!sid) return;

    setStoreId(sid);

    const p = await fetch(`/api/products?storeId=${sid}`).then((r) =>
      r.json(),
    );

    setProducts(p.products || []);
  }

  useEffect(() => {
    load();
  }, []);

  function handleImageChange(file: File | null) {
    if (preview) {
      URL.revokeObjectURL(preview);
    }

    if (!file) {
      setImage(null);
      setPreview("");
      return;
    }

    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type)
    ) {
      setImage(null);
      setPreview("");
      setError("Only JPG, PNG, and WebP images are allowed");
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImage(null);
      setPreview("");
      setError("Image must be 5MB or smaller");
      return;
    }

    setError("");
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  async function uploadImage() {
    if (!image) return "";

    const formData = new FormData();
    formData.append("file", image);

    const res = await fetch("/api/uploads/product", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Image upload failed");
    }

    return data.url as string;
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();

    if (!storeId) return;

    setError("");
    setSaving(true);

    try {
      const imageUrl = await uploadImage();

      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          name,
          priceNgn: Number(priceNgn),
          stock: Number(stock),
          imageUrl: imageUrl || undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to add product");
      }

      setName("");
      setPriceNgn("");
      setStock("10");
      handleImageChange(null);

      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Product) {
    await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        productId: p.id,
        active: !p.active,
      }),
    });

    await load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this product?")) return;

    await fetch(`/api/products?productId=${id}`, {
      method: "DELETE",
    });

    await load();
  }

  if (storeId === null && products.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        Create a store first to manage products.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Products</h1>

      <form
        onSubmit={addProduct}
        className="space-y-4 rounded-xl border border-ink-100 bg-white p-4"
      >
        <p className="text-sm font-medium text-ink-800">Add product</p>

        <label className="block">
          <span className="mb-2 block text-sm font-medium text-ink-700">
            Product image
          </span>

          <div className="flex items-center gap-4">
            <label className="flex h-28 w-28 cursor-pointer items-center justify-center overflow-hidden rounded-xl border border-dashed border-ink-300 bg-ink-50">
              {preview ? (
                <img
                  src={preview}
                  alt="Product preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <span className="px-2 text-center text-xs text-ink-500">
                  Tap to upload
                </span>
              )}

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) =>
                  handleImageChange(e.target.files?.[0] || null)
                }
              />
            </label>

            <div className="text-xs text-ink-500">
              <p>JPG, PNG or WebP</p>
              <p>Maximum 5MB</p>
            </div>
          </div>
        </label>

        <input
          className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
          placeholder="Product name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 gap-2">
          <input
            className="rounded-lg border border-ink-200 px-3 py-2 text-sm"
            placeholder="Price (NGN)"
            type="number"
            min="1"
            step="1"
            value={priceNgn}
            onChange={(e) => setPriceNgn(e.target.value)}
            required
          />

          <input
            className="rounded-lg border border-ink-200 px-3 py-2 text-sm"
            placeholder="Stock"
            type="number"
            min="0"
            value={stock}
            onChange={(e) => setStock(e.target.value)}
            required
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Adding product..." : "Add product"}
        </button>
      </form>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center">
          <p className="font-medium">No products yet</p>
          <p className="mt-1 text-sm text-ink-500">
            Add your first product to start selling.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-ink-100 overflow-hidden rounded-xl border border-ink-100 bg-white">
          {products.map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt={p.name}
                  className="h-16 w-16 rounded-lg object-cover"
                />
              ) : (
                <div className="h-16 w-16 rounded-lg bg-ink-50" />
              )}

              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink-900">{p.name}</p>

                <p className="text-sm text-ink-500">
                  {formatNgn(p.priceKobo)} · Stock {p.stock} ·{" "}
                  {p.active ? "Active" : "Inactive"}
                </p>
              </div>

              <button
                type="button"
                onClick={() => toggleActive(p)}
                className="text-xs text-ink-600"
              >
                {p.active ? "Deactivate" : "Activate"}
              </button>

              <button
                type="button"
                onClick={() => remove(p.id)}
                className="text-xs text-red-600"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
