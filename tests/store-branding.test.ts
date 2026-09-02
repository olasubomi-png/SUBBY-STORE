import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { patchStoreSchema } from "@/lib/stores/schema";
import {
  isManagedBlobUrl,
  blobBelongsToUser,
  assertAllowedImageFile,
  setBlobAdapters,
  tryDeleteManagedBlob,
  deleteManagedBlob,
} from "@/lib/server/blob";
import {
  replaceStoreBrandingImage,
  removeStoreBrandingImage,
} from "@/lib/server/storeBranding";
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
  setBlobAdapters({ put: null, del: null });
});

afterEach(() => {
  resetMemoryStore();
  setBlobAdapters({ put: null, del: null });
});

describe("store patch schema", () => {
  it("accepts valid branding update", () => {
    expect(
      patchStoreSchema.safeParse({
        storeId: 1,
        name: "Ada Fashion",
        description: "Quality ankara",
        logoUrl: "https://cdn.example.com/logo.jpg",
        instagramUrl: "https://instagram.com/ada",
      }).success
    ).toBe(true);
  });

  it("rejects invalid storeId, email, URL, long text, unknown fields", () => {
    expect(patchStoreSchema.safeParse({ storeId: -1, name: "X" }).success).toBe(
      false
    );
    expect(
      patchStoreSchema.safeParse({ storeId: 1, email: "not-email" }).success
    ).toBe(false);
    expect(
      patchStoreSchema.safeParse({ storeId: 1, logoUrl: "not-a-url" }).success
    ).toBe(false);
    expect(
      patchStoreSchema.safeParse({
        storeId: 1,
        description: "x".repeat(2001),
      }).success
    ).toBe(false);
    expect(
      patchStoreSchema.safeParse({ storeId: 1, ownerId: 99 }).success
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

describe("store ownership", () => {
  it("owner can update branding and contact fields", async () => {
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
      facebookUrl: "https://facebook.com/lagos",
      twitterUrl: "https://x.com/lagos",
      tiktokUrl: "https://tiktok.com/@lagos",
      phone: "08012345678",
      whatsapp: "08012345678",
      email: "shop@ex.com",
      address: "Lagos Island",
    });
    expect(updated.description).toBe("Fresh produce");
    expect(updated.logoUrl).toBe("https://example.com/logo.png");
    expect(updated.bannerUrl).toBe("https://example.com/banner.png");
    expect(updated.instagramUrl).toBe("https://instagram.com/lagos");
    expect(updated.phone).toBe("08012345678");
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

describe("blob security", () => {
  it("only treats vercel product/store paths as managed", () => {
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

  it("refuses to delete external or foreign URLs", async () => {
    await expect(
      deleteManagedBlob("https://evil.com/x.jpg", 1)
    ).rejects.toThrow(/Refusing/);
    await expect(
      deleteManagedBlob(
        "https://x.public.blob.vercel-storage.com/stores/2/logo/a.jpg",
        1
      )
    ).rejects.toThrow(/Refusing/);
    expect(
      await tryDeleteManagedBlob("https://example.com/logo.png", 1)
    ).toBe(false);
  });

  it("validates image type and size", () => {
    const ok = new File([new Uint8Array(10)], "a.jpg", { type: "image/jpeg" });
    expect(() => assertAllowedImageFile(ok)).not.toThrow();
    const gif = new File([new Uint8Array(10)], "a.gif", { type: "image/gif" });
    expect(() => assertAllowedImageFile(gif)).toThrow(/JPG/);
  });
});

describe("branding blob lifecycle", () => {
  it("uploads, updates DB, and deletes previous managed blob", async () => {
    const deleted: string[] = [];
    const putUrls: string[] = [];
    setBlobAdapters({
      put: async (pathname) => {
        const url = `https://x.public.blob.vercel-storage.com/${pathname}`;
        putUrls.push(url);
        return { url };
      },
      del: async (url) => {
        deleted.push(url);
      },
    });

    const user = await memSignup({
      email: "blob@ex.com",
      password: "password12",
      fullName: "Blob",
    });
    const store = memCreateStore({
      ownerId: user.id,
      name: "Blob Store Inc",
    });
    const oldUrl = `https://x.public.blob.vercel-storage.com/stores/${user.id}/logo/old.jpg`;
    await updateStore(user.id, store.id, { logoUrl: oldUrl });

    const file = new File([new Uint8Array(20)], "logo.jpg", {
      type: "image/jpeg",
    });
    const result = await replaceStoreBrandingImage({
      userId: user.id,
      storeId: store.id,
      kind: "logo",
      file,
    });

    expect(result.url).toContain(`/stores/${user.id}/logo/`);
    expect(result.store.logoUrl).toBe(result.url);
    expect(deleted).toContain(oldUrl);
    expect(putUrls.length).toBe(1);
  });

  it("non-owner cannot upload branding (fails before put)", async () => {
    const putCount = { n: 0 };
    setBlobAdapters({
      put: async (pathname) => {
        putCount.n++;
        return {
          url: `https://x.public.blob.vercel-storage.com/${pathname}`,
        };
      },
    });
    const user = await memSignup({
      email: "fail@ex.com",
      password: "password12",
      fullName: "Fail",
    });
    const owner = await memSignup({
      email: "own@ex.com",
      password: "password12",
      fullName: "Own",
    });
    const store = memCreateStore({
      ownerId: owner.id,
      name: "Owned Store Place",
    });
    const file = new File([new Uint8Array(20)], "logo.jpg", {
      type: "image/jpeg",
    });
    await expect(
      replaceStoreBrandingImage({
        userId: user.id,
        storeId: store.id,
        kind: "logo",
        file,
      })
    ).rejects.toThrow();
    expect(putCount.n).toBe(0);
  });

  it("on DB failure after upload, deletes the new blob", async () => {
    const deleted: string[] = [];
    const putUrls: string[] = [];
    setBlobAdapters({
      put: async (pathname) => {
        const url = `https://x.public.blob.vercel-storage.com/${pathname}`;
        putUrls.push(url);
        return { url };
      },
      del: async (url) => {
        deleted.push(url);
      },
    });

    const user = await memSignup({
      email: "dbfail@ex.com",
      password: "password12",
      fullName: "DbFail",
    });
    const store = memCreateStore({
      ownerId: user.id,
      name: "Db Fail Store Co",
    });

    const repo = await import("@/lib/server/repo");
    const spy = vi
      .spyOn(repo, "updateStore")
      .mockRejectedValueOnce(new Error("db down"));

    const file = new File([new Uint8Array(20)], "logo.jpg", {
      type: "image/jpeg",
    });
    await expect(
      replaceStoreBrandingImage({
        userId: user.id,
        storeId: store.id,
        kind: "logo",
        file,
      })
    ).rejects.toThrow(/db down/);

    expect(putUrls.length).toBe(1);
    expect(deleted).toEqual(putUrls);
    spy.mockRestore();
  });

  it("removes branding and deletes managed blob", async () => {
    const deleted: string[] = [];
    setBlobAdapters({
      put: async (pathname) => ({
        url: `https://x.public.blob.vercel-storage.com/${pathname}`,
      }),
      del: async (url) => {
        deleted.push(url);
      },
    });

    const user = await memSignup({
      email: "rm@ex.com",
      password: "password12",
      fullName: "Rm",
    });
    const store = memCreateStore({
      ownerId: user.id,
      name: "Remove Brand Store",
    });
    const url = `https://x.public.blob.vercel-storage.com/stores/${user.id}/banner/b.jpg`;
    await updateStore(user.id, store.id, { bannerUrl: url });

    const result = await removeStoreBrandingImage({
      userId: user.id,
      storeId: store.id,
      kind: "banner",
    });
    expect(result.store.bannerUrl).toBeNull();
    expect(deleted).toContain(url);
  });

  it("does not delete external URLs on remove", async () => {
    const deleted: string[] = [];
    setBlobAdapters({
      del: async (url) => {
        deleted.push(url);
      },
    });
    const user = await memSignup({
      email: "ext@ex.com",
      password: "password12",
      fullName: "Ext",
    });
    const store = memCreateStore({
      ownerId: user.id,
      name: "External Logo Store",
    });
    await updateStore(user.id, store.id, {
      logoUrl: "https://cdn.example.com/logo.png",
    });
    await removeStoreBrandingImage({
      userId: user.id,
      storeId: store.id,
      kind: "logo",
    });
    expect(deleted).toHaveLength(0);
  });

  it("rejects invalid MIME before upload", async () => {
    const user = await memSignup({
      email: "mime@ex.com",
      password: "password12",
      fullName: "Mime",
    });
    const store = memCreateStore({
      ownerId: user.id,
      name: "Mime Store Place",
    });
    const file = new File([new Uint8Array(10)], "x.gif", { type: "image/gif" });
    await expect(
      replaceStoreBrandingImage({
        userId: user.id,
        storeId: store.id,
        kind: "logo",
        file,
      })
    ).rejects.toThrow(/JPG/);
  });
});
