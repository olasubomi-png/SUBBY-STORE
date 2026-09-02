import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { patchStoreSchema } from "@/lib/stores/schema";
import {
  isManagedBlobUrl,
  blobBelongsToUser,
} from "@/lib/server/blob";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
} from "@/lib/server/memory-repo";
import { updateStore, getStoreOwned } from "@/lib/server/repo";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
});

afterEach(() => {
  resetMemoryStore();
});

describe("store patch schema", () => {
  it("accepts valid branding update", () => {
    const r = patchStoreSchema.safeParse({
      storeId: 1,
      name: "Ada Fashion",
      description: "Quality ankara",
      logoUrl: "https://cdn.example.com/logo.jpg",
      instagramUrl: "https://instagram.com/ada",
    });
    expect(r.success).toBe(true);
  });

  it("rejects invalid URL and long description", () => {
    expect(
      patchStoreSchema.safeParse({
        storeId: 1,
        logoUrl: "not-a-url",
      }).success
    ).toBe(false);
    expect(
      patchStoreSchema.safeParse({
        storeId: 1,
        description: "x".repeat(2001),
      }).success
    ).toBe(false);
  });

  it("rejects unknown fields", () => {
    expect(
      patchStoreSchema.safeParse({
        storeId: 1,
        ownerId: 99,
      }).success
    ).toBe(false);
  });

  it("allows null image removal", () => {
    expect(
      patchStoreSchema.safeParse({
        storeId: 1,
        logoUrl: null,
        bannerUrl: null,
      }).success
    ).toBe(true);
  });
});

describe("store ownership updates", () => {
  it("owner can update branding fields", async () => {
    const user = await memSignup({
      email: "owner@ex.com",
      password: "password12",
      fullName: "Owner",
    });
    const store = memCreateStore({
      ownerId: user.id,
      name: "Lagos Market",
    });
    const updated = await updateStore(user.id, store.id, {
      description: "Fresh produce",
      logoUrl: "https://example.com/logo.png",
      bannerUrl: "https://example.com/banner.png",
      instagramUrl: "https://instagram.com/lagos",
      phone: "08012345678",
    });
    expect(updated.description).toBe("Fresh produce");
    expect(updated.logoUrl).toBe("https://example.com/logo.png");
    expect(updated.bannerUrl).toBe("https://example.com/banner.png");
    expect(updated.instagramUrl).toBe("https://instagram.com/lagos");
  });

  it("non-owner cannot update store", async () => {
    const a = await memSignup({
      email: "a2@ex.com",
      password: "password12",
      fullName: "A",
    });
    const b = await memSignup({
      email: "b2@ex.com",
      password: "password12",
      fullName: "B",
    });
    const store = memCreateStore({ ownerId: a.id, name: "A Store Place" });
    await expect(getStoreOwned(store.id, b.id)).rejects.toThrow();
    await expect(
      updateStore(b.id, store.id, { name: "Hacked" })
    ).rejects.toThrow();
  });
});

describe("store blob namespace", () => {
  it("recognizes store and product managed paths", () => {
    const storeUrl =
      "https://x.public.blob.vercel-storage.com/stores/5/logo/a.jpg";
    const productUrl =
      "https://x.public.blob.vercel-storage.com/products/5/a.jpg";
    expect(isManagedBlobUrl(storeUrl)).toBe(true);
    expect(isManagedBlobUrl(productUrl)).toBe(true);
    expect(blobBelongsToUser(storeUrl, 5)).toBe(true);
    expect(blobBelongsToUser(storeUrl, 9)).toBe(false);
    expect(isManagedBlobUrl("https://evil.com/stores/5/logo/a.jpg")).toBe(
      false
    );
  });
});
