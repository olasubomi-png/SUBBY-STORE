"use client";

import Link from "next/link";
import { formatNgn } from "@/lib/money";
import type { DiscoveryProduct } from "@/lib/storefront/discovery";

export type ProductCardProps = {
  product: DiscoveryProduct;
  storeSlug: string;
  onAdd?: (productId: number) => void;
  wishlisted?: boolean;
  onToggleWishlist?: (productId: number) => void;
  display?: {
    currentKobo: number;
    originalKobo: number;
    discountKobo: number;
    badge: string | null;
  };
};

export function ProductCard({
  product,
  storeSlug,
  onAdd,
  wishlisted,
  onToggleWishlist,
  display,
}: ProductCardProps) {
  const out = product.stock <= 0;
  const low = !out && product.stock > 0 && product.stock <= 5;
  const current = display?.currentKobo ?? product.priceKobo;
  const onSale = Boolean(display && display.discountKobo > 0);

  return (
    <li className="relative flex flex-col overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
      {onToggleWishlist ? (
        <button
          type="button"
          aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
          onClick={() => onToggleWishlist(product.id)}
          className="absolute right-2 top-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 text-lg shadow-sm"
        >
          {wishlisted ? "♥" : "♡"}
        </button>
      ) : null}
      <Link
        href={`/store/${storeSlug}/product/${product.slug}`}
        className="relative block aspect-[4/3] bg-ink-50"
      >
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-300">
            No image
          </div>
        )}
        {product.featured ? (
          <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Featured
          </span>
        ) : null}
        {display?.badge ? (
          <span className="absolute bottom-2 left-2 rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-white">
            {display.badge}
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-[11px] uppercase tracking-wide text-ink-400">
          {product.category || "General"}
        </p>
        <Link
          href={`/store/${storeSlug}/product/${product.slug}`}
          className="mt-0.5 line-clamp-2 text-sm font-medium text-ink-900 hover:text-brand-700"
        >
          {product.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-2">
          <p className="text-sm font-semibold tabular-nums text-ink-950">
            {formatNgn(current)}
          </p>
          {onSale ? (
            <p className="text-xs tabular-nums text-ink-400 line-through">
              {formatNgn(display!.originalKobo)}
            </p>
          ) : null}
        </div>
        <p className="mt-0.5 text-xs text-ink-400">
          {out ? "Out of stock" : low ? `Only ${product.stock} left` : "In stock"}
        </p>
        {onAdd ? (
          <button
            type="button"
            disabled={out}
            onClick={() => onAdd(product.id)}
            className="mt-auto pt-3 text-left text-sm font-medium text-brand-700 transition active:opacity-70 disabled:cursor-not-allowed disabled:text-ink-300"
          >
            {out ? "Unavailable" : "Add to cart"}
          </button>
        ) : null}
      </div>
    </li>
  );
}
