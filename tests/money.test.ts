import { describe, expect, it } from "vitest";
import {
  formatNgn,
  lineTotalKobo,
  ngnMajorToKobo,
  sumKobo,
} from "@/lib/money";
import { priceCart } from "@/lib/server/cart";

describe("money", () => {
  it("converts NGN major to kobo", () => {
    expect(ngnMajorToKobo(25)).toBe(2500);
    expect(ngnMajorToKobo(25.5)).toBe(2550);
  });

  it("computes line totals without floats", () => {
    expect(lineTotalKobo(150000, 2)).toBe(300000);
  });

  it("sums cart lines", () => {
    expect(sumKobo([1000, 2500, 500])).toBe(4000);
  });

  it("formats NGN", () => {
    expect(formatNgn(18500000)).toContain("185,000");
  });
});

describe("server-side cart pricing", () => {
  const products = [
    { id: 1, name: "Dress", priceKobo: 1500000, stock: 5, active: true },
    { id: 2, name: "Bag", priceKobo: 500000, stock: 2, active: true },
  ];

  it("prices from database amounts not client amounts", () => {
    const cart = priceCart(
      [
        { productId: 1, quantity: 1 },
        { productId: 2, quantity: 2 },
      ],
      products
    );
    expect(cart.totalKobo).toBe(1500000 + 1_000_000);
  });

  it("rejects inactive and overstock", () => {
    expect(() =>
      priceCart([{ productId: 1, quantity: 1 }], [
        { ...products[0], active: false },
      ])
    ).toThrow(/not available/);
    expect(() =>
      priceCart([{ productId: 2, quantity: 5 }], products)
    ).toThrow(/stock/i);
  });
});
