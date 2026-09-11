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


describe("gallery primary sync and create imageUrls", () => {
  it("keeps products.imageUrl synced to gallery primary after reorder", async () => {
    const {
      addProductImage,
      reorderProductImages,
      listProductImages,
    } = await import("@/lib/server/repo");
    const a = await memSignup({
      email: "sync@ex.com",
      password: "password12",
      fullName: "Sync",
    });
    const store = memCreateStore({ ownerId: a.id, name: "Sync Shop" });
    const product = memCreateProduct({
      ownerId: a.id,
      storeId: store.id,
      name: "Item",
      priceKobo: 2000,
      stock: 1,
      imageUrl: "https://x.public.blob.vercel-storage.com/products/1/p1.jpg",
    });
    await addProductImage(
      a.id,
      product.id,
      "https://x.public.blob.vercel-storage.com/products/1/p2.jpg"
    );
    const imgs = await listProductImages(product.id);
    const reversed = [...imgs].reverse().map((i) => i.id);
    await reorderProductImages(a.id, product.id, reversed);
    const { getMemoryStore } = await import("@/lib/server/memory-repo");
    const updated = getMemoryStore().products.find((p) => p.id === product.id);
    expect(updated?.imageUrl).toBe(
      imgs[imgs.length - 1]?.imageUrl
    );
  });

  it("createProduct accepts imageUrls and stores ordered gallery", async () => {
    const { createProduct, listProductImages } = await import(
      "@/lib/server/repo"
    );
    const a = await memSignup({
      email: "multi@ex.com",
      password: "password12",
      fullName: "Multi",
    });
    const store = memCreateStore({ ownerId: a.id, name: "Multi Shop" });
    const urls = [
      "https://x.public.blob.vercel-storage.com/products/9/a.jpg",
      "https://x.public.blob.vercel-storage.com/products/9/b.jpg",
    ];
    const product = await createProduct({
      ownerId: a.id,
      storeId: store.id,
      name: "Multi",
      priceKobo: 3000,
      stock: 4,
      imageUrls: urls,
    });
    expect(product.imageUrl).toBe(urls[0]);
    const gallery = await listProductImages(product.id);
    expect(gallery.map((g) => g.imageUrl)).toEqual(urls);
  });
});

describe("product management 2.0", () => {
  beforeEach(() => {
    resetMemoryStore();
    process.env.USE_MEMORY_DB = "1";
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  });
  afterEach(() => resetMemoryStore());

  async function seedTwoSellers() {
    const a = await memSignup({
      email: `a-${Math.random().toString(16).slice(2)}@ex.com`,
      password: "password12",
      fullName: "A",
    });
    const b = await memSignup({
      email: `b-${Math.random().toString(16).slice(2)}@ex.com`,
      password: "password12",
      fullName: "B",
    });
    const shopA = memCreateStore({ ownerId: a.id, name: "Shop A" });
    const shopB = memCreateStore({ ownerId: b.id, name: "Shop B" });
    const p1 = memCreateProduct({
      ownerId: a.id,
      storeId: shopA.id,
      name: "Alpha Tee",
      priceKobo: 500000,
      stock: 3,
      category: "Fashion",
    });
    // gallery extra
    const { memAddProductImage } = await import("@/lib/server/memory-repo");
    memAddProductImage(a.id, p1.id, "https://example.com/a1.jpg");
    memAddProductImage(a.id, p1.id, "https://example.com/a2.jpg");
    const p2 = memCreateProduct({
      ownerId: a.id,
      storeId: shopA.id,
      name: "Beta Mug",
      priceKobo: 200000,
      stock: 0,
      category: "Home",
    });
    const pB = memCreateProduct({
      ownerId: b.id,
      storeId: shopB.id,
      name: "Other",
      priceKobo: 100000,
      stock: 10,
    });
    return { a, b, shopA, p1, p2, pB };
  }

  it("bulk activates and deactivates owned products", async () => {
    const { bulkSetProductsActive } = await import("@/lib/server/repo");
    const { getMemoryStore } = await import("@/lib/server/memory-repo");
    const { a, p1, p2 } = await seedTwoSellers();
    await bulkSetProductsActive(a.id, [p1.id, p2.id], false);
    expect(getMemoryStore().products.find((p) => p.id === p1.id)!.active).toBe(
      false
    );
    expect(getMemoryStore().products.find((p) => p.id === p2.id)!.active).toBe(
      false
    );
    await bulkSetProductsActive(a.id, [p1.id], true);
    expect(getMemoryStore().products.find((p) => p.id === p1.id)!.active).toBe(
      true
    );
  });

  it("bulk delete removes owned products only", async () => {
    const { bulkDeleteProducts } = await import("@/lib/server/repo");
    const { getMemoryStore } = await import("@/lib/server/memory-repo");
    const { a, b, p1, p2, pB } = await seedTwoSellers();
    await bulkDeleteProducts(a.id, [p1.id, p2.id]);
    expect(getMemoryStore().products.find((p) => p.id === p1.id)).toBeUndefined();
    expect(getMemoryStore().products.find((p) => p.id === pB.id)).toBeTruthy();
    await expect(bulkDeleteProducts(a.id, [pB.id])).rejects.toThrow();
    expect(getMemoryStore().products.find((p) => p.id === pB.id)).toBeTruthy();
  });

  it("duplicate creates unique slug and preserves gallery order", async () => {
    const { duplicateProduct, getProductImageUrls } = await import(
      "@/lib/server/repo"
    );
    const { getMemoryStore } = await import("@/lib/server/memory-repo");
    const { a, p1 } = await seedTwoSellers();
    const copy = await duplicateProduct(a.id, p1.id);
    expect(copy.id).not.toBe(p1.id);
    expect(copy.name).toContain("(copy)");
    expect(copy.slug).not.toBe(
      getMemoryStore().products.find((p) => p.id === p1.id)!.slug
    );
    expect(copy.priceKobo).toBe(500000);
    expect(copy.stock).toBe(3);
    expect(copy.category).toBe("Fashion");
    const urls = await getProductImageUrls(copy.id, copy.imageUrl);
    // primary from create + two added = up to 3; memCreate may seed empty
    expect(urls.length).toBeGreaterThanOrEqual(2);
    expect(urls[0]).toBe("https://example.com/a1.jpg");
    expect(urls[1]).toBe("https://example.com/a2.jpg");
    // second duplicate still unique slug
    const copy2 = await duplicateProduct(a.id, p1.id);
    expect(copy2.slug).not.toBe(copy.slug);
  });

  it("blocks cross-owner bulk and duplicate", async () => {
    const {
      bulkSetProductsActive,
      bulkDeleteProducts,
      duplicateProduct,
    } = await import("@/lib/server/repo");
    const { a, b, p1, pB } = await seedTwoSellers();
    await expect(
      bulkSetProductsActive(b.id, [p1.id], false)
    ).rejects.toThrow();
    await expect(bulkDeleteProducts(b.id, [p1.id])).rejects.toThrow();
    await expect(duplicateProduct(b.id, p1.id)).rejects.toThrow();
    await expect(duplicateProduct(a.id, pB.id)).rejects.toThrow();
  });

  it("classifies low stock for filter threshold", async () => {
    const { classifyStock, LOW_STOCK_THRESHOLD } = await import(
      "@/lib/inventory"
    );
    expect(classifyStock(0)).toBe("out");
    expect(classifyStock(LOW_STOCK_THRESHOLD)).toBe("low");
    expect(classifyStock(LOW_STOCK_THRESHOLD + 1)).toBe("in");
  });
});

describe("bulk delete blob cleanup and selection", () => {
  beforeEach(() => {
    resetMemoryStore();
    process.env.USE_MEMORY_DB = "1";
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  });
  afterEach(async () => {
    resetMemoryStore();
    const { setBlobAdapters } = await import("@/lib/server/blob");
    setBlobAdapters({ put: null, del: null });
  });

  it("bulkDeleteProducts returns gallery and primary image URLs", async () => {
    const user = await memSignup({
      email: `blob-${Math.random().toString(16).slice(2)}@ex.com`,
      password: "password12",
      fullName: "Seller",
    });
    const shop = memCreateStore({ ownerId: user.id, name: "Blob Shop" });
    const primary =
      "https://x.public.blob.vercel-storage.com/products/1/primary.jpg";
    // use realistic path with user id
    const uid = user.id;
    const url1 = `https://x.public.blob.vercel-storage.com/products/${uid}/a.jpg`;
    const url2 = `https://x.public.blob.vercel-storage.com/products/${uid}/b.jpg`;
    const product = memCreateProduct({
      ownerId: user.id,
      storeId: shop.id,
      name: "With Gallery",
      priceKobo: 10000,
      stock: 2,
      imageUrl: url1,
    });
    const { memAddProductImage } = await import("@/lib/server/memory-repo");
    memAddProductImage(user.id, product.id, url2);

    const { bulkDeleteProducts } = await import("@/lib/server/repo");
    const result = await bulkDeleteProducts(user.id, [product.id]);
    expect(result.deleted).toBe(1);
    expect(result.imageUrls.sort()).toEqual([url1, url2].sort());
  });

  it("bulk delete path best-effort deletes managed blobs for owner only", async () => {
    const { setBlobAdapters, tryDeleteManagedBlob, blobBelongsToUser } =
      await import("@/lib/server/blob");
    const deleted: string[] = [];
    setBlobAdapters({
      del: async (url: string) => {
        deleted.push(url);
      },
    });

    const user = await memSignup({
      email: `del-${Math.random().toString(16).slice(2)}@ex.com`,
      password: "password12",
      fullName: "Seller",
    });
    const uid = user.id;
    const owned = `https://x.public.blob.vercel-storage.com/products/${uid}/ok.jpg`;
    const foreign = `https://x.public.blob.vercel-storage.com/products/99999/no.jpg`;
    expect(blobBelongsToUser(owned, uid)).toBe(true);
    expect(blobBelongsToUser(foreign, uid)).toBe(false);

    expect(await tryDeleteManagedBlob(owned, uid)).toBe(true);
    expect(await tryDeleteManagedBlob(foreign, uid)).toBe(false);
    expect(deleted).toEqual([owned]);
  });

  it("reconcileSelectedIds drops hidden selections", async () => {
    const { reconcileSelectedIds } = await import("@/lib/products/selection");
    expect(reconcileSelectedIds([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
    expect(reconcileSelectedIds([1, 2], [1, 2])).toEqual([1, 2]);
    expect(reconcileSelectedIds([9], [1, 2])).toEqual([]);
  });
});
