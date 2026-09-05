import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { classifyStock, LOW_STOCK_THRESHOLD } from "@/lib/inventory";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
  memAdjustProductStock,
  memListInventoryForOwner,
  getMemoryStore,
} from "@/lib/server/memory-repo";

describe("stock classification", () => {
  it("classifies out / low / in", () => {
    expect(classifyStock(0)).toBe("out");
    expect(classifyStock(-1)).toBe("out");
    expect(classifyStock(1)).toBe("low");
    expect(classifyStock(LOW_STOCK_THRESHOLD)).toBe("low");
    expect(classifyStock(LOW_STOCK_THRESHOLD + 1)).toBe("in");
  });
});

describe("inventory adjustments", () => {
  beforeEach(() => {
    resetMemoryStore();
    process.env.USE_MEMORY_DB = "1";
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  });
  afterEach(() => resetMemoryStore());

  async function seed() {
    const user = await memSignup({
      email: `inv-${Math.random().toString(16).slice(2)}@ex.com`,
      password: "password12",
      fullName: "Seller",
    });
    const shop = memCreateStore({ ownerId: user.id, name: "Inv Shop" });
    const product = memCreateProduct({
      ownerId: user.id,
      storeId: shop.id,
      name: "Widget",
      priceKobo: 10000,
      stock: 5,
    });
    return { user, shop, product };
  }

  it("increments and decrements stock", async () => {
    const { user, product } = await seed();
    memAdjustProductStock(user.id, product.id, { mode: "delta", value: 3 });
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(8);
    memAdjustProductStock(user.id, product.id, { mode: "delta", value: -2 });
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(6);
  });

  it("sets exact stock and persists", async () => {
    const { user, product } = await seed();
    memAdjustProductStock(user.id, product.id, { mode: "set", value: 12 });
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(12);
    const list = memListInventoryForOwner(user.id);
    expect(list.find((p) => p.id === product.id)?.stock).toBe(12);
  });

  it("rejects negative stock", async () => {
    const { user, product } = await seed();
    expect(() =>
      memAdjustProductStock(user.id, product.id, { mode: "set", value: -1 })
    ).toThrow(/negative/i);
    expect(() =>
      memAdjustProductStock(user.id, product.id, { mode: "delta", value: -99 })
    ).toThrow(/negative/i);
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(5);
  });

  it("isolates sellers", async () => {
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
    const sa = memCreateStore({ ownerId: a.id, name: "A Shop" });
    const sb = memCreateStore({ ownerId: b.id, name: "B Shop" });
    const pa = memCreateProduct({
      ownerId: a.id,
      storeId: sa.id,
      name: "A",
      priceKobo: 1000,
      stock: 3,
    });
    const pb = memCreateProduct({
      ownerId: b.id,
      storeId: sb.id,
      name: "B",
      priceKobo: 2000,
      stock: 7,
    });

    expect(memListInventoryForOwner(a.id).map((p) => p.id)).toEqual([pa.id]);
    expect(memListInventoryForOwner(b.id).map((p) => p.id)).toEqual([pb.id]);
    expect(() =>
      memAdjustProductStock(a.id, pb.id, { mode: "set", value: 0 })
    ).toThrow();
    expect(getMemoryStore().products.find((p) => p.id === pb.id)!.stock).toBe(7);
  });
});
