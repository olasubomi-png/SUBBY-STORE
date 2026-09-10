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
  featured?: boolean;
  imageUrl?: string | null;
  /** Gallery URLs (primary first); falls back to imageUrl */
  images?: string[];
};

type GalleryImage = { id: number; imageUrl: string; sortOrder: number };

type FormState = {
  name: string;
  description: string;
  priceNgn: string;
  stock: string;
  category: string;
  active: boolean;
  featured: boolean;
};

const blank = (): FormState => ({
  name: "",
  description: "",
  priceNgn: "",
  stock: "10",
  category: "General",
  active: true,
  featured: false,
});

export default function ProductsPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [create, setCreate] = useState<FormState>(blank());
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [editGallery, setEditGallery] = useState<GalleryImage[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [edit, setEdit] = useState<FormState>(blank());
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      // Single authenticated request — server resolves the seller's store
      const res = await fetch("/api/products", {
        credentials: "include",
        cache: "no-store",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(
          typeof data.error === "string" ? data.error : "Could not load products",
        );
        setStoreId(null);
        setProducts([]);
        return;
      }
      const sid =
        typeof data.storeId === "number" && data.storeId > 0
          ? data.storeId
          : null;
      setStoreId(sid);
      setProducts(Array.isArray(data.products) ? data.products : []);
      setError("");
    } catch {
      setError("Could not load products");
      setStoreId(null);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  function clearCreateImages() {
    previews.forEach((u) => URL.revokeObjectURL(u));
    setImageFiles([]);
    setPreviews([]);
  }

  function handleCreateImages(files: FileList | null) {
    if (!files || files.length === 0) return;
    const next: File[] = [...imageFiles];
    const nextPrev: string[] = [...previews];
    for (const file of Array.from(files)) {
      if (next.length >= 12) {
        setError("Maximum 12 images per product");
        break;
      }
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
        setError("Only JPG, PNG, and WebP images are allowed");
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError("Image must be 5MB or smaller");
        continue;
      }
      next.push(file);
      nextPrev.push(URL.createObjectURL(file));
    }
    setError("");
    setImageFiles(next);
    setPreviews(nextPrev);
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

  async function cleanupUploadedUrls(urls: string[]) {
    if (urls.length === 0) return;
    try {
      await fetch("/api/uploads/product/cleanup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ urls }),
      });
    } catch {
      /* best-effort */
    }
  }

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId || saving) return;
    setSaving(true);
    setError("");
    setSuccess("");
    const uploadedUrls: string[] = [];
    let productCreated = false;
    try {
      for (const file of imageFiles) {
        const url = await uploadFile(file);
        uploadedUrls.push(url);
      }
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
          imageUrl: uploadedUrls[0] || undefined,
          imageUrls: uploadedUrls.length > 0 ? uploadedUrls : undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to create product",
        );
      }
      productCreated = true;
      setCreate(blank());
      clearCreateImages();
      setSuccess("Product added");
      await load();
    } catch (err) {
      // Only delete blobs when the product was never persisted
      if (!productCreated && uploadedUrls.length > 0) {
        await cleanupUploadedUrls(uploadedUrls);
      }
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
      featured: Boolean(p.featured),
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
          featured: edit.featured,
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

  async function addGalleryImage(productId: number, file: File) {
    setUploading(true);
    setError("");
    let uploadedUrl: string | null = null;
    let registered = false;
    try {
      uploadedUrl = await uploadFile(file, productId);
      const res = await fetch("/api/products/images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, imageUrl: uploadedUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Failed to add image",
        );
      }
      registered = true;
      if (Array.isArray(data.images)) setEditGallery(data.images);
      setSuccess("Image added");
      await load();
    } catch (err) {
      if (uploadedUrl && !registered) {
        await cleanupUploadedUrls([uploadedUrl]);
      }
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function removeGalleryImage(imageId: number) {
    if (imageId <= 0) return;
    if (!confirm("Remove this product image?")) return;
    const res = await fetch(`/api/products/images?imageId=${imageId}`, {
      method: "DELETE",
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    if (Array.isArray(data.images)) setEditGallery(data.images);
    setSuccess("Image removed");
    await load();
  }

  async function setPrimaryImage(productId: number, imageId: number) {
    if (imageId <= 0 || editGallery.length === 0) return;
    const ordered = [
      imageId,
      ...editGallery.map((g) => g.id).filter((id) => id !== imageId),
    ];
    const res = await fetch("/api/products/images", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId, orderedImageIds: ordered }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to set primary");
      return;
    }
    if (Array.isArray(data.images)) setEditGallery(data.images);
    setSuccess("Primary image updated");
    await load();
  }

  if (storeId === null && products.length === 0) {
    return (
      <p className="text-sm text-ink-500">
        Create a store first to manage products.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-ink-100" />
        <div className="h-40 animate-pulse rounded-xl bg-ink-100" />
        <div className="h-24 animate-pulse rounded-xl bg-ink-100" />
        <div className="h-24 animate-pulse rounded-xl bg-ink-100" />
      </div>
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
          <span className="text-ink-600">Photos (optional, up to 12)</span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="mt-1 block w-full text-sm"
            onChange={(e) => {
              handleCreateImages(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        {previews.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {previews.map((src, i) => (
              <li key={src} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={src}
                  alt=""
                  className="h-20 w-20 rounded-lg object-cover"
                />
                {i === 0 ? (
                  <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 text-[10px] text-white">
                    Primary
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
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
                  {(p.images?.[0] || p.imageUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={p.images?.[0] || p.imageUrl || ""}
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
                    {p.featured ? " · Featured" : ""}
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
                  {uploading ? "Uploading…" : "Add photo"}
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void addGalleryImage(p.id, f);
                      e.target.value = "";
                    }}
                  />
                </label>
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
                  
                  <div className="space-y-2">
                    <p className="text-xs font-medium text-ink-600">Gallery</p>
                    {editGallery.length === 0 ? (
                      <p className="text-xs text-ink-400">No photos yet</p>
                    ) : (
                      <ul className="flex flex-wrap gap-2">
                        {editGallery.map((g, idx) => (
                          <li
                            key={g.id}
                            className="relative overflow-hidden rounded-lg border border-ink-200"
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={g.imageUrl}
                              alt=""
                              className="h-20 w-20 object-cover"
                            />
                            {idx === 0 ? (
                              <span className="absolute left-1 top-1 rounded bg-brand-600 px-1 text-[10px] text-white">
                                Primary
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void setPrimaryImage(p.id, g.id)}
                                className="absolute left-1 top-1 rounded bg-black/60 px-1 text-[10px] text-white"
                              >
                                Make primary
                              </button>
                            )}
                            {g.id > 0 ? (
                              <button
                                type="button"
                                onClick={() => void removeGalleryImage(g.id)}
                                className="absolute bottom-1 right-1 rounded bg-red-600 px-1 text-[10px] text-white"
                              >
                                Remove
                              </button>
                            ) : null}
                          </li>
                        ))}
                      </ul>
                    )}
                    <label className="inline-flex cursor-pointer items-center rounded-md border border-ink-200 px-2.5 py-1 text-xs text-ink-600">
                      {uploading ? "Uploading…" : "Add photo"}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        disabled={uploading}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void addGalleryImage(p.id, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                  </div>

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
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={edit.featured}
                      onChange={(e) =>
                        setEdit({ ...edit, featured: e.target.checked })
                      }
                    />
                    Featured product
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
