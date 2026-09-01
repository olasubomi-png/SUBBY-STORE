"use client";

import { useEffect, useState } from "react";
import { formatNgn, koboToNgnMajor } from "@/lib/money";

type Product = {
  id: number;
  name: string;
  priceKobo: number;
  stock: number;
  active: boolean;
};

export default function ProductsPage() {
  const [storeId, setStoreId] = useState<number | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [priceNgn, setPriceNgn] = useState("");
  const [stock, setStock] = useState("10");
  const [error, setError] = useState("");

  async function load() {
    const d = await fetch("/api/dashboard").then((r) => r.json());
    const sid = d.stores?.[0]?.id;
    if (!sid) return;
    setStoreId(sid);
    const p = await fetch(`/api/products?storeId=${sid}`).then((r) => r.json());
    setProducts(p.products || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function addProduct(e: React.FormEvent) {
    e.preventDefault();
    if (!storeId) return;
    setError("");
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        storeId,
        name,
        priceNgn: Number(priceNgn),
        stock: Number(stock),
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setName("");
    setPriceNgn("");
    await load();
  }

  async function toggleActive(p: Product) {
    await fetch("/api/products", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ productId: p.id, active: !p.active }),
    });
    await load();
  }

  async function remove(id: number) {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/products?productId=${id}`, { method: "DELETE" });
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
        className="space-y-3 rounded-xl border border-ink-100 bg-white p-4"
      >
        <p className="text-sm font-medium text-ink-800">Add product</p>
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
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white"
        >
          Add product
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
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
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
