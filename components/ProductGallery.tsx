"use client";

import { useState } from "react";

/** Gallery designed for multiple images; today products may only have one. */
export function ProductGallery({
  images,
  alt,
}: {
  images: string[];
  alt: string;
}) {
  const list = images.filter(Boolean);
  const [index, setIndex] = useState(0);
  const current = list[index] || null;

  if (list.length === 0) {
    return (
      <div className="flex aspect-square items-center justify-center rounded-2xl border border-ink-100 bg-ink-100 text-sm text-ink-400">
        No product image
      </div>
    );
  }

  return (
    <div>
      <div className="aspect-square overflow-hidden rounded-2xl border border-ink-100 bg-ink-100">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current!}
          alt={alt}
          className="h-full w-full object-cover"
        />
      </div>
      {list.length > 1 ? (
        <div
          className="mt-3 flex gap-2 overflow-x-auto"
          role="tablist"
          aria-label="Product images"
        >
          {list.map((url, i) => (
            <button
              key={url + i}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Image ${i + 1}`}
              onClick={() => setIndex(i)}
              className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                i === index ? "border-brand-600" : "border-transparent"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
