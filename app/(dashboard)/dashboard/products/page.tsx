"use client";

import { useEffect, useState } from "react";
import { formatNgn, koboToNgnMajor } from "@/lib/money";
import { SUGGESTED_CATEGORIES } from "@/lib/products/schema";

type Product = {
  id: number;
  name: string;
  description?: string;
  priceKobo: number;
  stock: number;
  category?: string;
  active: boolean;
  imageUrl?: string | null;
};

type FormState = {
  name: string;
  description: string;
  priceNgn: string;
  stock: string;
  category: string;
  active: boolean;
};

const blank = (): FormState => ({
  name: "",
  description: "",
  priceNgn: "",
  stock: "10",
  category: "General",
  active: true,
});

export default function ProductsPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [create, setCreate] = useState<FormState>(blank());
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState<FormState>(blank());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  async function load() {
    const d = await fetch("/api/dashboard").then((r) => r.json());
    const sid = d.stores?.[0]?.id as number | undefined;
    if (!sid) {
      setStoreId(null);
      setProducts([]);
      return;
    }
    setStoreId(sid);
    const p = await fetch(`/api/products?storeId=${sid}`).then((r) => r.json());
    setProducts(p.products || []);
  }

  useEffect(() => {
    load();
  }, []);

  function handleCreateImage(file: File | null) {
    if (preview) URL.revokeObjectURL(preview);
    if (!file) {
      setImage(null);
      setPreview("");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Only JPG, PNG, and WebP images are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("Image must be 5MB or smaller");
      return;
    }
    setError("");
    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  async function uploadFile(file: File, productId?: number) {
    const formData = new FormData();
    formData.append("file", file);
    if (productId) formData.append("productId", String(productId));
    const res = await fetch("/api/uploads/product", {
      method: "POST",
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Image upload failed");
    return data.url as string;
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      let imageUrl = "";
      if (image) imageUrl = await uploadFile(image);
      const res = await fetch("/api/products", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeId,
          name: create.name,
          description: create.description,
          priceNgn: Number(create.priceNgn),
          stock: Number(create.stock),
          category: create.category,
          imageUrl: imageUrl || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create product");
      setCreate(blank());
      handleCreateImage(null);
      setSuccess("Product added");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(p: Product) {
    setEditingId(p.id);
    setEdit({
      name: p.name,
      description: p.description || "",
      priceNgn: String(koboToNgnMajor(p.priceKobo)),
      stock: String(p.stock),
      category: p.category || "General",
      active: p.active,
    });
    setError("");
    setSuccess("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (editingId == null || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: editingId,
          name: edit.name,
          description: edit.description,
          priceNgn: Number(edit.priceNgn),
          stock: Number(edit.stock),
          category: edit.category,
          active: edit.active,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      setEditingId(null);
      setSuccess("Product updated");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(p: Product) {
    const res = await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.id, active: !p.active }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed");
      return;
    }
    await load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    const res = await fetch(`/api/products?productId=${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed");
      return;
    }
    if (editingId === id) setEditingId(null);
    setSuccess("Product deleted");
    await load();
  }

  async function replaceImage(productId: number, file: File) {
    setUploading(true);
    setError("");
    try {
      const url = await uploadFile(file, productId);
      const res = await fetch("/api/products", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, imageUrl: url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to set image");
      setSuccess("Image updated");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeImage(productId: number) {
    if (!confirm("Remove this product image?")) return;
    const res = await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, imageUrl: null }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setSuccess("Image removed");
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
      <h1 className="text-2xl font-semibold text-ink-950">Products</h1>

      {(error || success) && (
        <p
          className={`text-sm ${error ? "text-red-600" : "text-brand-700"}`}
          role="status"
        >
          {error || success}
        </p>
      )}

      <form
        onSubmit={addProduct}
        className="space-y-3 rounded-xl border border-ink-100 bg-white p-4"
      >
        <p className="text-sm font-medium text-ink-800">Add product</p>
        <label className="block text-sm">
          <span className="text-ink-600">Name</span>
          <input
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
            value={create.name}
            onChange={(e) => setCreate({ ...create, name: e.target.value })}
            required
            maxLength={160}
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-600">Description</span>
          <textarea
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
            rows={3}
            value={create.description}
            onChange={(e) =>
              setCreate({ ...create, description: e.target.value })
            }
            maxLength={4000}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm">
            <span className="text-ink-600">Price (NGN)</span>
            <input
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              type="number"
              min="1"
              value={create.priceNgn}
              onChange={(e) =>
                setCreate({ ...create, priceNgn: e.target.value })
              }
              required
            />
          </label>
          <label className="block text-sm">
            <span className="text-ink-600">Stock</span>
            <input
              className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
              type="number"
              min="0"
              value={create.stock}
              onChange={(e) => setCreate({ ...create, stock: e.target.value })}
              required
            />
          </label>
        </div>
        <label className="block text-sm">
          <span className="text-ink-600">Category</span>
          <input
            list="category-options"
            className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
            value={create.category}
            onChange={(e) =>
              setCreate({ ...create, category: e.target.value })
            }
            maxLength={80}
          />
          <datalist id="category-options">
            {SUGGESTED_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label className="block text-sm">
          <span className="text-ink-600">Image (optional)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="mt-1 block w-full text-sm"
            onChange={(e) => handleCreateImage(e.target.files?.[0] ?? null)}
          />
        </label>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={preview}
            alt=""
            className="h-24 w-24 rounded-lg object-cover"
          />
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {saving ? "Saving…" : "Add product"}
        </button>
      </form>

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-ink-200 bg-white p-8 text-center">
          <p className="font-medium text-ink-900">No products yet</p>
          <p className="mt-1 text-sm text-ink-500">
            Add your first product to start selling.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {products.map((p) => (
            <li
              key={p.id}
              className="rounded-xl border border-ink-100 bg-white p-4"
            >
              <div className="flex gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-ink-100">
                  {p.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.imageUrl}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[10px] text-ink-400">
                      No image
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-ink-900">{p.name}</p>
                  <p className="text-xs text-ink-500">
                    {p.category || "General"}
                  </p>
                  <p className="mt-1 text-sm text-ink-600">
                    {formatNgn(p.priceKobo)} · Stock {p.stock} ·{" "}
                    {p.active ? "Active" : "Inactive"}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => startEdit(p)}
                  className="rounded-md border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-700"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => toggleActive(p)}
                  className="rounded-md border border-ink-200 px-2.5 py-1 text-xs text-ink-600"
                >
                  {p.active ? "Deactivate" : "Activate"}
                </button>
                <label className="cursor-pointer rounded-md border border-ink-200 px-2.5 py-1 text-xs text-ink-600">
                  {uploading ? "Uploading…" : "Replace image"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) replaceImage(p.id, f);
                      e.target.value = "";
                    }}
                  />
                </label>
                {p.imageUrl ? (
                  <button
                    type="button"
                    onClick={() => removeImage(p.id)}
                    className="rounded-md border border-ink-200 px-2.5 py-1 text-xs text-ink-600"
                  >
                    Remove image
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(p.id)}
                  className="rounded-md border border-red-200 px-2.5 py-1 text-xs text-red-600"
                >
                  Delete
                </button>
              </div>

              {editingId === p.id ? (
                <form
                  onSubmit={saveEdit}
                  className="mt-4 space-y-2 border-t border-ink-100 pt-4"
                >
                  <label className="block text-sm">
                    Name
                    <input
                      className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                      value={edit.name}
                      onChange={(e) =>
                        setEdit({ ...edit, name: e.target.value })
                      }
                      required
                      maxLength={160}
                    />
                  </label>
                  <label className="block text-sm">
                    Description
                    <textarea
                      className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                      rows={3}
                      value={edit.description}
                      onChange={(e) =>
                        setEdit({ ...edit, description: e.target.value })
                      }
                      maxLength={4000}
                    />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block text-sm">
                      Price (NGN)
                      <input
                        type="number"
                        min="1"
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                        value={edit.priceNgn}
                        onChange={(e) =>
                          setEdit({ ...edit, priceNgn: e.target.value })
                        }
                        required
                      />
                    </label>
                    <label className="block text-sm">
                      Stock
                      <input
                        type="number"
                        min="0"
                        className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                        value={edit.stock}
                        onChange={(e) =>
                          setEdit({ ...edit, stock: e.target.value })
                        }
                        required
                      />
                    </label>
                  </div>
                  <label className="block text-sm">
                    Category
                    <input
                      list="category-options-edit"
                      className="mt-1 w-full rounded-lg border border-ink-200 px-3 py-2 text-sm"
                      value={edit.category}
                      onChange={(e) =>
                        setEdit({ ...edit, category: e.target.value })
                      }
                      maxLength={80}
                    />
                    <datalist id="category-options-edit">
                      {SUGGESTED_CATEGORIES.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={edit.active}
                      onChange={(e) =>
                        setEdit({ ...edit, active: e.target.checked })
                      }
                    />
                    Active (visible in store)
                  </label>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingId(null)}
                      className="rounded-lg border border-ink-200 px-3 py-1.5 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
