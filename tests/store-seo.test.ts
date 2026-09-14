import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveStoreSeo } from "@/lib/storefront/seo";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  getMemoryStore,
} from "@/lib/server/memory-repo";
import { updateStore } from "@/lib/server/repo";
import { patchStoreSchema } from "@/lib/stores/schema";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
});
afterEach(() => {
  resetMemoryStore();
});

describe("resolveStoreSeo", () => {
  it("falls back to name and description", () => {
    const seo = resolveStoreSeo(
      {
        name: "Ola Shop",
        slug: "ola",
        description: "Best thrift in Lagos",
      },
      "https://subby-store.vercel.app"
    );
    expect(seo.title).toBe("Ola Shop");
    expect(seo.description).toBe("Best thrift in Lagos");
    expect(seo.canonical).toBe("https://subby-store.vercel.app/store/ola");
  });

  it("prefers explicit SEO and OG fields", () => {
    const seo = resolveStoreSeo({
      name: "Ola Shop",
      slug: "ola",
      description: "Fallback desc",
      seoTitle: "Buy thrift online",
      seoDescription: "Custom SEO desc",
      seoKeywords: "thrift, lagos",
      ogTitle: "Share title",
      ogDescription: "Share desc",
      ogImageUrl: "https://cdn.example.com/og.jpg",
      logoUrl: "https://cdn.example.com/logo.jpg",
    });
    expect(seo.title).toBe("Buy thrift online");
    expect(seo.description).toBe("Custom SEO desc");
    expect(seo.ogTitle).toBe("Share title");
    expect(seo.ogDescription).toBe("Share desc");
    expect(seo.ogImage).toBe("https://cdn.example.com/og.jpg");
    expect(seo.keywords).toEqual(["thrift", "lagos"]);
  });

  it("uses banner then logo for image fallback", () => {
    const seo = resolveStoreSeo({
      name: "S",
      slug: "s",
      bannerUrl: "https://cdn.example.com/b.jpg",
      logoUrl: "https://cdn.example.com/l.jpg",
    });
    expect(seo.ogImage).toBe("https://cdn.example.com/b.jpg");
  });
});

describe("store SEO persistence", () => {
  it("updates SEO fields via updateStore", async () => {
    const user = await memSignup({
      email: "seo@ex.com",
      password: "password12",
      fullName: "Seo",
    });
    const shop = memCreateStore({
      ownerId: user.id,
      name: "SEO Shop",
      slug: "seoshop",
    });
    const updated = await updateStore(user.id, shop.id, {
      seoTitle: "Custom title",
      seoDescription: "Custom description for search",
      ogImageUrl: "https://example.com/og.png",
    });
    expect(updated.seoTitle).toBe("Custom title");
    expect(updated.seoDescription).toBe("Custom description for search");
    expect(updated.ogImageUrl).toBe("https://example.com/og.png");
    const row = getMemoryStore().stores.find((s) => s.id === shop.id)!;
    expect(row.seoTitle).toBe("Custom title");
  });

  it("rejects invalid SEO payload lengths", () => {
    const bad = patchStoreSchema.safeParse({
      storeId: 1,
      seoTitle: "x".repeat(71),
    });
    expect(bad.success).toBe(false);
  });

  it("accepts valid SEO patch", () => {
    const ok = patchStoreSchema.safeParse({
      storeId: 1,
      seoTitle: "My store",
      seoDescription: "A great store",
      seoKeywords: "a, b",
      ogTitle: "Share me",
      ogDescription: "Share text",
      ogImageUrl: "https://cdn.example.com/x.jpg",
    });
    expect(ok.success).toBe(true);
  });
});
