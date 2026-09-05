import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { classifyStock, LOW_STOCK_THRESHOLD } from "@/lib/inventory";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
  memCreatePendingOrder,
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

describe("available stock + atomic updates", () => {
  beforeEach(() => {
    resetMemoryStore();
    process.env.USE_MEMORY_DB = "1";
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  });
  afterEach(() => resetMemoryStore());

  async function seedWithReservation(stock = 10, reserveQty = 4) {
    const user = await memSignup({
      email: `res-${Math.random().toString(16).slice(2)}@ex.com`,
      password: "password12",
      fullName: "Seller",
    });
    const shop = memCreateStore({ ownerId: user.id, name: "Res Shop" });
    const product = memCreateProduct({
      ownerId: user.id,
      storeId: shop.id,
      name: "Reserved Widget",
      priceKobo: 10000,
      stock,
    });
    await memCreatePendingOrder({
      storeId: shop.id,
      customerName: "Buyer",
      customerPhone: "080",
      customerEmail: "buyer@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: reserveQty }],
      paymentReference: `ref_res_${Math.random().toString(16).slice(2)}`,
    });
    // products.stock is available: stock - reserveQty
    return { user, shop, product, reserved: reserveQty };
  }

  it("reservation decrements available stock", async () => {
    const { product } = await seedWithReservation(10, 4);
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(6);
  });

  it("available stock may be set to zero while reservations remain", async () => {
    const { user, product } = await seedWithReservation(10, 4);
    memAdjustProductStock(user.id, product.id, { mode: "set", value: 0 });
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(0);
    // reservation still active
    expect(getMemoryStore().orders[0].stockReserved).toBe(true);
  });

  it("rejects negative available stock via delta", async () => {
    const { user, product } = await seedWithReservation(10, 4);
    // available is 6
    expect(() =>
      memAdjustProductStock(user.id, product.id, { mode: "delta", value: -7 })
    ).toThrow(/negative/i);
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(6);
  });

  it("atomic updateProduct: stock failure leaves name unchanged", async () => {
    const { updateProduct } = await import("@/lib/server/repo");
    const { user, product } = await seedWithReservation(10, 4);
    const originalName = product.name;
    const originalStock = getMemoryStore().products.find(
      (p) => p.id === product.id
    )!.stock;

    await expect(
      updateProduct(user.id, product.id, {
        name: "Changed Name",
        stock: -1,
      })
    ).rejects.toThrow(/negative/i);

    const after = getMemoryStore().products.find((p) => p.id === product.id)!;
    expect(after.name).toBe(originalName);
    expect(after.stock).toBe(originalStock);
  });

  it("atomic updateProduct: name and valid stock commit together", async () => {
    const { updateProduct } = await import("@/lib/server/repo");
    const { user, product } = await seedWithReservation(10, 4);

    const ok = await updateProduct(user.id, product.id, {
      name: "Changed Name",
      stock: 5,
    });
    expect(ok.name).toBe("Changed Name");
    expect(ok.stock).toBe(5);
    const after = getMemoryStore().products.find((p) => p.id === product.id)!;
    expect(after.name).toBe("Changed Name");
    expect(after.stock).toBe(5);
  });
});
