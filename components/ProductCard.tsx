"use client";

import Link from "next/link";
import { formatNgn } from "@/lib/money";
import type { DiscoveryProduct } from "@/lib/storefront/discovery";

export function ProductCard({
  product,
  storeSlug,
  onAdd,
}: {
  product: DiscoveryProduct;
  storeSlug: string;
  onAdd?: (productId: number) => void;
}) {
  const out = product.stock <= 0;
  return (
    <li className="group flex flex-col overflow-hidden rounded-xl border border-ink-100 bg-white shadow-sm transition hover:border-ink-200 hover:shadow-md">
      <Link
        href={`/store/${storeSlug}/product/${product.slug}`}
        className="relative block aspect-square bg-ink-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
      >
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt={product.name}
            className="h-full w-full object-cover transition group-hover:scale-[1.02]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-ink-400">
            No image
          </div>
        )}
        {product.featured ? (
          <span className="absolute left-2 top-2 rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            Featured
          </span>
        ) : null}
      </Link>
      <div className="flex flex-1 flex-col p-3">
        <p className="text-[10px] font-medium uppercase tracking-wide text-ink-400">
          {product.category || "General"}
        </p>
        <Link
          href={`/store/${storeSlug}/product/${product.slug}`}
          className="mt-0.5 line-clamp-2 text-sm font-medium text-ink-900 hover:text-brand-700"
        >
          {product.name}
        </Link>
        <p className="mt-1 text-sm font-semibold tabular-nums text-ink-950">
          {formatNgn(product.priceKobo)}
        </p>
        <p className="mt-0.5 text-xs text-ink-400">
          {out ? "Out of stock" : "In stock"}
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
