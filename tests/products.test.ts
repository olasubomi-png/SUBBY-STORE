import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createProductSchema,
  patchProductSchema,
} from "@/lib/products/schema";
import {
  isManagedBlobUrl,
  blobBelongsToUser,
} from "@/lib/server/blob";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
} from "@/lib/server/memory-repo";
import {
  updateProduct,
  deleteProduct,
  getProductOwned,
} from "@/lib/server/repo";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
});

afterEach(() => {
  resetMemoryStore();
});

describe("product create schema", () => {
  it("accepts valid product", () => {
    expect(
      createProductSchema.safeParse({
        storeId: 1,
        name: "Dress",
        priceNgn: 15000,
        stock: 5,
        category: "Fashion",
      }).success
    ).toBe(true);
  });

  it("rejects invalid name, price, stock, category, image", () => {
    expect(
      createProductSchema.safeParse({
        storeId: 1,
        name: "  ",
        priceNgn: 10,
        stock: 1,
      }).success
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        storeId: 1,
        name: "X",
        priceNgn: -1,
        stock: 1,
      }).success
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        storeId: 1,
        name: "X",
        priceNgn: 10,
        stock: -1,
      }).success
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        storeId: 1,
        name: "X",
        priceNgn: 10,
        stock: 1,
        category: "c".repeat(81),
      }).success
    ).toBe(false);
    expect(
      createProductSchema.safeParse({
        storeId: 1,
        name: "X",
        priceNgn: 10,
        stock: 1,
        imageUrl: "bad",
      }).success
    ).toBe(false);
  });
});

describe("product patch schema", () => {
  it("accepts partial update and null image", () => {
    expect(
      patchProductSchema.safeParse({ productId: 1, priceNgn: 200 }).success
    ).toBe(true);
    expect(
      patchProductSchema.safeParse({ productId: 1, imageUrl: null }).success
    ).toBe(true);
  });

  it("rejects invalid active, description, stock, extra keys", () => {
    expect(
      patchProductSchema.safeParse({ productId: 1, active: "yes" }).success
    ).toBe(false);
    expect(
      patchProductSchema.safeParse({
        productId: 1,
        description: "d".repeat(4001),
      }).success
    ).toBe(false);
    expect(
      patchProductSchema.safeParse({ productId: 1, stock: -1 }).success
    ).toBe(false);
    expect(
      patchProductSchema.safeParse({ productId: 1, extra: true }).success
    ).toBe(false);
  });
});

describe("product authorization", () => {
  it("blocks cross-owner edit/delete", async () => {
    const a = await memSignup({
      email: "a@ex.com",
      password: "password12",
      fullName: "A",
    });
    const b = await memSignup({
      email: "b@ex.com",
      password: "password12",
      fullName: "B",
    });
    const store = memCreateStore({ ownerId: a.id, name: "Ada Shop" });
    const product = memCreateProduct({
      ownerId: a.id,
      storeId: store.id,
      name: "Item",
      priceKobo: 1000,
      stock: 1,
    });
    await expect(getProductOwned(product.id, b.id)).rejects.toThrow(/Forbidden/);
    await expect(updateProduct(b.id, product.id, { name: "X" })).rejects.toThrow();
    await expect(deleteProduct(b.id, product.id)).rejects.toThrow();
  });

  it("owner can update description category and clear image", async () => {
    const a = await memSignup({
      email: "c@ex.com",
      password: "password12",
      fullName: "C",
    });
    const store = memCreateStore({ ownerId: a.id, name: "Cee Shop" });
    const product = memCreateProduct({
      ownerId: a.id,
      storeId: store.id,
      name: "Bag",
      priceKobo: 5000,
      stock: 2,
      imageUrl: "https://example.com/x.jpg",
    });
    const updated = await updateProduct(a.id, product.id, {
      description: "Nice",
      category: "Fashion",
      imageUrl: null,
    });
    expect(updated.description).toBe("Nice");
    expect(updated.category).toBe("Fashion");
    expect(updated.imageUrl).toBeNull();
  });
});

describe("blob security", () => {
  it("only allows managed product blob URLs for the owner", () => {
    const url =
      "https://x.public.blob.vercel-storage.com/products/7/file.jpg";
    expect(isManagedBlobUrl(url)).toBe(true);
    expect(blobBelongsToUser(url, 7)).toBe(true);
    expect(blobBelongsToUser(url, 8)).toBe(false);
    expect(isManagedBlobUrl("https://evil.com/products/7/x.jpg")).toBe(false);
  });
});


describe("seller products load path", () => {
  it("lists products for the owner first store without a separate dashboard call", async () => {
    const { listStoresForOwner, listProducts } = await import("@/lib/server/repo");
    const a = await memSignup({
      email: "prod-load@ex.com",
      password: "password12",
      fullName: "Seller",
    });
    const store = memCreateStore({ ownerId: a.id, name: "Load Shop" });
    memCreateProduct({
      ownerId: a.id,
      storeId: store.id,
      name: "Widget",
      priceKobo: 5000,
      stock: 3,
    });
    const stores = await listStoresForOwner(a.id);
    expect(stores[0]?.id).toBe(store.id);
    const products = await listProducts(stores[0]!.id);
    expect(products).toHaveLength(1);
    expect(products[0]?.name).toBe("Widget");
  });
});

describe("product gallery", () => {
  it("supports multiple images, primary reorder, and legacy imageUrl", async () => {
    const {
      listProductImages,
      addProductImage,
      deleteProductImage,
      reorderProductImages,
      getProductImageUrls,
    } = await import("@/lib/server/repo");

    const a = await memSignup({
      email: "gallery@ex.com",
      password: "password12",
      fullName: "Gal",
    });
    const store = memCreateStore({ ownerId: a.id, name: "Gallery Shop" });
    const product = memCreateProduct({
      ownerId: a.id,
      storeId: store.id,
      name: "Shoes",
      priceKobo: 9000,
      stock: 2,
      imageUrl: "https://x.public.blob.vercel-storage.com/products/1/a.jpg",
    });

    // Legacy URL appears in gallery
    const initial = await listProductImages(product.id);
    expect(initial.length).toBeGreaterThanOrEqual(1);

    await addProductImage(
      a.id,
      product.id,
      "https://x.public.blob.vercel-storage.com/products/1/b.jpg"
    );
    await addProductImage(
      a.id,
      product.id,
      "https://x.public.blob.vercel-storage.com/products/1/c.jpg"
    );
    const all = await listProductImages(product.id);
    expect(all.length).toBeGreaterThanOrEqual(3);

    const reordered = await reorderProductImages(
      a.id,
      product.id,
      [...all].reverse().map((i) => i.id)
    );
    expect(reordered[0]?.id).toBe(all[all.length - 1]?.id);

    const urls = await getProductImageUrls(product.id);
    expect(urls[0]).toBe(reordered[0]?.imageUrl);

    const removed = await deleteProductImage(a.id, reordered[0]!.id);
    expect(removed.productId).toBe(product.id);
  });

  it("rejects cross-seller gallery mutations", async () => {
    const { addProductImage, deleteProductImage } = await import(
      "@/lib/server/repo"
    );
    const a = await memSignup({
      email: "own@ex.com",
      password: "password12",
      fullName: "Own",
    });
    const b = await memSignup({
      email: "oth@ex.com",
      password: "password12",
      fullName: "Oth",
    });
    const store = memCreateStore({ ownerId: a.id, name: "Own Shop" });
    const product = memCreateProduct({
      ownerId: a.id,
      storeId: store.id,
      name: "Bag",
      priceKobo: 1000,
      stock: 1,
    });
    await expect(
      addProductImage(
        b.id,
        product.id,
        "https://x.public.blob.vercel-storage.com/products/2/x.jpg"
      )
    ).rejects.toThrow();
  });
});
