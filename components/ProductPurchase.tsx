"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatNgn } from "@/lib/money";
import {
  addToCartLines,
  clampQuantity,
  readCart,
  writeCart,
} from "@/lib/storefront/cart-client";
import { ProductGallery } from "@/components/ProductGallery";
import {
  isWishlisted,
  toggleWishlistId,
} from "@/lib/storefront/wishlist-client";
import { trackStoreEvent } from "@/lib/storefront/events-client";
import { shareOrCopy } from "@/lib/storefront/share";

export type PurchaseProduct = {
  id: number;
  name: string;
  description: string;
  priceKobo: number;
  stock: number;
  category: string;
  featured: boolean;
  imageUrl: string | null;
  /** Future multi-image support */
  imageUrls?: string[];
};

export function ProductPurchase({
  storeSlug,
  storeName,
  product,
}: {
  storeSlug: string;
  storeName: string;
  product: PurchaseProduct;
}) {
  const router = useRouter();
  const out = product.stock <= 0;
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wish, setWish] = useState(false);
  const [shareMsg, setShareMsg] = useState("");

  const viewTracked = useRef<string | null>(null);
  useEffect(() => {
    setWish(isWishlisted(storeSlug, product.id));
    const key = `${storeSlug}:${product.id}`;
    if (viewTracked.current === key) return;
    viewTracked.current = key;
    void trackStoreEvent({
      storeSlug,
      eventType: "product_view",
      productId: product.id,
    });
  }, [storeSlug, product.id]);

  const images = useMemo(() => {
    if (product.imageUrls && product.imageUrls.length > 0) {
      return product.imageUrls.filter(Boolean);
    }
    return product.imageUrl ? [product.imageUrl] : [];
  }, [product.imageUrl, product.imageUrls]);

  function setSafeQty(next: number) {
    setQty(clampQuantity(next, product.stock));
  }

  function handleAdd() {
    if (out) return;
    try {
      const current = readCart(storeSlug);
      const next = addToCartLines(current, product.id, qty, product.stock);
      writeCart(storeSlug, next);
      void trackStoreEvent({
        storeSlug,
        eventType: "add_to_cart",
        productId: product.id,
      });
      setMessage(`Added ${qty} to cart`);
      setTimeout(() => setMessage(null), 2500);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not add to cart");
    }
  }

  function handleBuyNow() {
    if (out || busy) return;
    setBusy(true);
    try {
      // Replace cart with this product only for a clean Buy Now path
      writeCart(storeSlug, [
        {
          productId: product.id,
          quantity: clampQuantity(qty, product.stock),
        },
      ]);
      router.push(`/store/${storeSlug}/checkout`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not start checkout");
      setBusy(false);
    }
  }

  return (
    <div>
      <ProductGallery images={images} alt={product.name} />

      <div className="mt-5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
            {product.category || "General"}
          </p>
          {product.featured ? (
            <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-700">
              Featured
            </span>
          ) : null}
        </div>
        <h1 className="mt-1 text-2xl font-semibold text-ink-950">{product.name}</h1>
        <p className="mt-2 text-xl font-semibold tabular-nums text-ink-950">
          {formatNgn(product.priceKobo)}
        </p>
        <p className="mt-2 text-sm text-ink-500">
          {out ? "Out of stock" : `${product.stock} in stock`}
        </p>
        {product.description ? (
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
            {product.description}
          </p>
        ) : null}

        <div className="mt-6 space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-sm text-ink-600">Quantity</span>
            <div className="inline-flex items-center rounded-lg border border-ink-200 bg-white">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={out || qty <= 1}
                onClick={() => setSafeQty(qty - 1)}
                className="px-3 py-2 text-sm font-medium text-ink-800 disabled:text-ink-300"
              >
                −
              </button>
              <span className="min-w-[2rem] text-center text-sm tabular-nums text-ink-900">
                {out ? 0 : qty}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={out || qty >= product.stock}
                onClick={() => setSafeQty(qty + 1)}
                className="px-3 py-2 text-sm font-medium text-ink-800 disabled:text-ink-300"
              >
                +
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={out}
              onClick={handleAdd}
              className="rounded-lg border border-ink-200 bg-white py-3 text-sm font-semibold text-ink-900 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Add to cart
            </button>
            <button
              type="button"
              disabled={out || busy}
              onClick={handleBuyNow}
              className="rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Redirecting…" : "Buy now"}
            </button>
          </div>

          {message ? (
            <p className="text-sm text-brand-700" role="status">
              {message}{" "}
              <a href={`/store/${storeSlug}/cart`} className="font-medium underline">
                View cart
              </a>
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              aria-label={wish ? "Remove from wishlist" : "Add to wishlist"}
              onClick={() => {
                const next = toggleWishlistId(storeSlug, product.id);
                setWish(next.includes(product.id));
                void trackStoreEvent({
                  storeSlug,
                  eventType: next.includes(product.id)
                    ? "wishlist_added"
                    : "wishlist_removed",
                  productId: product.id,
                });
              }}
              className="text-sm font-medium text-ink-700"
            >
              {wish ? "♥ Saved" : "♡ Wishlist"}
            </button>
            <button
              type="button"
              onClick={async () => {
                const url =
                  typeof window !== "undefined" ? window.location.href : "";
                const r = await shareOrCopy({
                  title: product.name,
                  text: product.name,
                  url,
                });
                setShareMsg(
                  r === "shared"
                    ? "Shared"
                    : r === "copied"
                      ? "Link copied"
                      : "Could not share"
                );
                void trackStoreEvent({
                  storeSlug,
                  eventType: "share_product",
                  productId: product.id,
                });
              }}
              className="text-sm font-medium text-ink-700"
            >
              Share
            </button>
            {shareMsg ? (
              <span className="text-xs text-brand-700">{shareMsg}</span>
            ) : null}
          </div>
          <p className="text-xs text-ink-400">Sold by {storeName}</p>
        </div>
      </div>
      {!out ? (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-ink-100 bg-white/95 p-3 backdrop-blur sm:hidden">
          <div className="mx-auto flex max-w-lg gap-2">
            <button
              type="button"
              onClick={handleAdd}
              className="flex-1 rounded-lg border border-ink-200 py-3 text-sm font-semibold"
            >
              Add to cart
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={handleBuyNow}
              className="flex-1 rounded-lg bg-brand-600 py-3 text-sm font-semibold text-white"
            >
              Buy now
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
