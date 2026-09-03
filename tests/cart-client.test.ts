import { describe, expect, it } from "vitest";
import {
  addToCartLines,
  clampCartToStock,
  clampQuantity,
  sanitizeCartLines,
  setCartLineQuantity,
} from "@/lib/storefront/cart-client";
import { priceCart, mergeCartItems } from "@/lib/server/cart";

describe("quantity limits", () => {
  it("clampQuantity respects stock and min 1", () => {
    expect(clampQuantity(0, 5)).toBe(1);
    expect(clampQuantity(3, 5)).toBe(3);
    expect(clampQuantity(10, 5)).toBe(5);
    expect(clampQuantity(2, 0)).toBe(1);
  });
});

describe("add-to-cart merging", () => {
  it("merges duplicate product lines and caps at stock", () => {
    const a = addToCartLines([], 1, 2, 5);
    expect(a).toEqual([{ productId: 1, quantity: 2 }]);
    const b = addToCartLines(a, 1, 2, 5);
    expect(b).toEqual([{ productId: 1, quantity: 4 }]);
    const c = addToCartLines(b, 1, 10, 5);
    expect(c).toEqual([{ productId: 1, quantity: 5 }]);
  });

  it("rejects out of stock add", () => {
    expect(() => addToCartLines([], 1, 1, 0)).toThrow(/Out of stock/);
  });
});

describe("sanitize and clamp", () => {
  it("drops invalid quantities and negative values", () => {
    expect(
      sanitizeCartLines([
        { productId: 1, quantity: -2 },
        { productId: 2, quantity: 3 },
        { productId: 0, quantity: 1 },
      ] as never[])
    ).toEqual([{ productId: 2, quantity: 3 }]);
  });

  it("clampCartToStock removes inactive and zero stock", () => {
    const lines = [
      { productId: 1, quantity: 5 },
      { productId: 2, quantity: 2 },
      { productId: 3, quantity: 1 },
    ];
    const products = [
      { id: 1, stock: 3, active: true },
      { id: 2, stock: 0, active: true },
      { id: 3, stock: 5, active: false },
    ];
    expect(clampCartToStock(lines, products)).toEqual([
      { productId: 1, quantity: 3 },
    ]);
  });

  it("setCartLineQuantity removes at zero", () => {
    const lines = [{ productId: 1, quantity: 2 }];
    expect(setCartLineQuantity(lines, 1, 0, 5)).toEqual([]);
  });
});

describe("server priceCart", () => {
  const products = [
    { id: 1, name: "A", priceKobo: 10000, stock: 5, active: true },
    { id: 2, name: "B", priceKobo: 5000, stock: 2, active: false },
    { id: 3, name: "C", priceKobo: 2000, stock: 1, active: true },
  ];

  it("uses server prices and rejects inactive", () => {
    const cart = priceCart([{ productId: 1, quantity: 2 }], products);
    expect(cart.totalKobo).toBe(20000);
    expect(() =>
      priceCart([{ productId: 2, quantity: 1 }], products)
    ).toThrow(/not available/);
  });

  it("rejects insufficient stock", () => {
    expect(() =>
      priceCart([{ productId: 3, quantity: 2 }], products)
    ).toThrow(/stock/i);
  });

  it("merges duplicate lines", () => {
    const merged = mergeCartItems([
      { productId: 1, quantity: 1 },
      { productId: 1, quantity: 2 },
    ]);
    expect(merged).toEqual([{ productId: 1, quantity: 3 }]);
  });
});
