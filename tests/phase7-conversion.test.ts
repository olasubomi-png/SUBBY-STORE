import { describe, expect, it } from "vitest";
import {
  displayPriceWithPromotion,
  type PublicPromotion,
} from "@/lib/storefront/promotions-display";
import { normalizeQuery } from "@/lib/storefront/discovery";

describe("promotion display pricing", () => {
  it("applies best percentage promotion for display", () => {
    const promos: PublicPromotion[] = [
      { code: "SAVE10", type: "percentage", value: 10, label: "10% OFF" },
      { code: "SAVE5", type: "percentage", value: 5, label: "5% OFF" },
    ];
    const r = displayPriceWithPromotion(1_000_000, promos);
    expect(r.discountKobo).toBe(100_000);
    expect(r.currentKobo).toBe(900_000);
    expect(r.badge).toBe("10% OFF");
  });

  it("never exceeds unit price for fixed promo", () => {
    const promos: PublicPromotion[] = [
      { code: "BIG", type: "fixed", value: 9_999_000, label: "BIG" },
    ];
    const r = displayPriceWithPromotion(50_000, promos);
    expect(r.currentKobo).toBe(0);
    expect(r.discountKobo).toBe(50_000);
  });
});

describe("wishlist key shape", () => {
  it("normalizes search query", () => {
    expect(normalizeQuery("  Hello ")).toBe("hello");
  });
});

describe("product-scoped promotion display", () => {
  it("applies only to eligible product ids", () => {
    const promos: PublicPromotion[] = [
      {
        code: "ONLY1",
        type: "percentage",
        value: 50,
        label: "50% OFF",
        productIds: [1],
      },
    ];
    const a = displayPriceWithPromotion(100_000, promos, 1);
    expect(a.discountKobo).toBe(50_000);
    const b = displayPriceWithPromotion(100_000, promos, 2);
    expect(b.discountKobo).toBe(0);
    expect(b.currentKobo).toBe(100_000);
  });
});
