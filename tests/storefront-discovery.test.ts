import { describe, expect, it } from "vitest";
import {
  deriveCategories,
  discoverProducts,
  filterProducts,
  relatedProducts,
  sortProducts,
  type DiscoveryProduct,
} from "@/lib/storefront/discovery";

const base = (
  over: Partial<DiscoveryProduct> & Pick<DiscoveryProduct, "id" | "name">
): DiscoveryProduct => ({
  slug: over.slug || over.name.toLowerCase().replace(/\s+/g, "-"),
  description: over.description || "",
  priceKobo: over.priceKobo ?? 10000,
  stock: over.stock ?? 5,
  imageUrl: null,
  category: over.category || "General",
  featured: over.featured ?? false,
  createdAt: over.createdAt ?? new Date("2026-01-01"),
  ...over,
});

const catalog: DiscoveryProduct[] = [
  base({
    id: 1,
    name: "Ankara Dress",
    description: "Cotton print dress",
    category: "Fashion",
    priceKobo: 15000,
    featured: true,
    stock: 3,
    createdAt: new Date("2026-03-01"),
  }),
  base({
    id: 2,
    name: "Phone Case",
    description: "Clear silicone case",
    category: "Electronics",
    priceKobo: 5000,
    stock: 10,
    createdAt: new Date("2026-04-01"),
  }),
  base({
    id: 3,
    name: "Sneakers",
    description: "Running shoes",
    category: "Fashion",
    priceKobo: 25000,
    stock: 0,
    createdAt: new Date("2026-02-01"),
  }),
  base({
    id: 4,
    name: "Lip Gloss",
    description: "Berry shade",
    category: "Beauty",
    priceKobo: 3500,
    featured: true,
    stock: 8,
    createdAt: new Date("2026-05-01"),
  }),
];

describe("search filtering", () => {
  it("matches name case-insensitively", () => {
    expect(filterProducts(catalog, { query: "ankara" }).map((p) => p.id)).toEqual([1]);
  });
  it("matches description", () => {
    expect(filterProducts(catalog, { query: "silicone" }).map((p) => p.id)).toEqual([2]);
  });
});

describe("category filtering", () => {
  it("derives categories from products", () => {
    expect(deriveCategories(catalog)).toEqual(["Beauty", "Electronics", "Fashion"]);
  });
  it("filters by category", () => {
    expect(filterProducts(catalog, { category: "Fashion" }).map((p) => p.id).sort()).toEqual([1, 3]);
  });
  it("combines search and category", () => {
    expect(discoverProducts(catalog, { query: "dress", category: "Fashion", sort: "name_asc" }).map((p) => p.id)).toEqual([1]);
  });
});

describe("sorting", () => {
  it("featured sort puts featured first", () => {
    expect(sortProducts(catalog, "featured").slice(0, 2).every((p) => p.featured)).toBe(true);
  });
  it("price ascending", () => {
    expect(sortProducts(catalog, "price_asc").map((p) => p.priceKobo)).toEqual([3500, 5000, 15000, 25000]);
  });
  it("name A-Z", () => {
    expect(sortProducts(catalog, "name_asc").map((p) => p.name)).toEqual(["Ankara Dress", "Lip Gloss", "Phone Case", "Sneakers"]);
  });
  it("newest by createdAt", () => {
    expect(sortProducts(catalog, "newest")[0].id).toBe(4);
  });
});

describe("related products", () => {
  it("excludes current product", () => {
    expect(relatedProducts(catalog, catalog[0], 4).every((p) => p.id !== 1)).toBe(true);
  });
  it("prefers same category", () => {
    expect(relatedProducts(catalog, catalog[0], 4)[0].category).toBe("Fashion");
  });
  it("limits results", () => {
    expect(relatedProducts(catalog, catalog[0], 2)).toHaveLength(2);
  });
});

describe("cart key format", () => {
  it("uses subby_cart_${slug}", () => {
    expect(`subby_cart_ada-fashion`).toBe("subby_cart_ada-fashion");
  });
});
