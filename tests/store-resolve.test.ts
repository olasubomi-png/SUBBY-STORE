import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
} from "@/lib/server/memory-repo";
import { GET as productsGET } from "@/app/api/products/route";
import { GET as couponsGET } from "@/app/api/coupons/route";
import * as auth from "@/lib/server/auth";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
});
afterEach(() => {
  resetMemoryStore();
  vi.restoreAllMocks();
});

describe("store resolution for products/coupons APIs", () => {
  it("returns storeId for authenticated seller with a store (products)", async () => {
    const user = await memSignup({
      email: "seller-a@ex.com",
      password: "password12",
      fullName: "Seller A",
    });
    const shop = memCreateStore({
      ownerId: user.id,
      name: "Subby ventures",
      slug: "ola",
    });
    vi.spyOn(auth, "getSession").mockResolvedValue({
      userId: user.id,
      email: user.email,
    });

    const res = await productsGET(new Request("http://localhost/api/products"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.storeId).toBe(shop.id);
    expect(data.storeId).not.toBeNull();
    expect(Array.isArray(data.products)).toBe(true);
  });

  it("returns storeId for authenticated seller with a store (coupons)", async () => {
    const user = await memSignup({
      email: "seller-b@ex.com",
      password: "password12",
      fullName: "Seller B",
    });
    const shop = memCreateStore({
      ownerId: user.id,
      name: "Subby ventures",
      slug: "ola-b",
    });
    vi.spyOn(auth, "getSession").mockResolvedValue({
      userId: user.id,
      email: user.email,
    });

    const res = await couponsGET(new Request("http://localhost/api/coupons"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.storeId).toBe(shop.id);
    expect(data.storeId).not.toBeNull();
    expect(Array.isArray(data.coupons)).toBe(true);
  });

  it("blocks cross-seller store access", async () => {
    const a = await memSignup({
      email: "own@ex.com",
      password: "password12",
      fullName: "Owner",
    });
    const b = await memSignup({
      email: "other@ex.com",
      password: "password12",
      fullName: "Other",
    });
    const shop = memCreateStore({ ownerId: a.id, name: "A Store", slug: "astore" });
    vi.spyOn(auth, "getSession").mockResolvedValue({
      userId: b.id,
      email: b.email,
    });

    const res = await productsGET(
      new Request(`http://localhost/api/products?storeId=${shop.id}`)
    );
    expect(res.status).toBe(404);
  });

  it("unauthenticated is 401", async () => {
    vi.spyOn(auth, "getSession").mockResolvedValue(null);
    const res = await productsGET(new Request("http://localhost/api/products"));
    expect(res.status).toBe(401);
  });

  it("authenticated seller without store gets storeId null", async () => {
    const user = await memSignup({
      email: "nostore@ex.com",
      password: "password12",
      fullName: "No Store",
    });
    vi.spyOn(auth, "getSession").mockResolvedValue({
      userId: user.id,
      email: user.email,
    });
    const res = await productsGET(new Request("http://localhost/api/products"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.storeId).toBeNull();
  });
});
