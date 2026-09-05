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

describe("reserved stock consistency", () => {
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
    // After reservation, available stock is stock - reserveQty
    return { user, shop, product, reserved: reserveQty };
  }

  it("rejects set below active reserved quantity", async () => {
    const { user, product } = await seedWithReservation(10, 4);
    // available after reserve = 6; reserved qty = 4
    // floor is reserved qty 4
    expect(() =>
      memAdjustProductStock(user.id, product.id, { mode: "set", value: 3 })
    ).toThrow(/reserved quantity/i);
  });

  it("allows set equal to active reserved quantity", async () => {
    const { user, product } = await seedWithReservation(10, 4);
    memAdjustProductStock(user.id, product.id, { mode: "set", value: 4 });
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(4);
  });

  it("rejects delta that would go below reserved quantity", async () => {
    const { user, product } = await seedWithReservation(10, 4);
    // available is 6; delta -3 → 3 < reserved 4
    expect(() =>
      memAdjustProductStock(user.id, product.id, { mode: "delta", value: -3 })
    ).toThrow(/reserved quantity/i);
    // delta -2 → 4 == reserved → allowed
    memAdjustProductStock(user.id, product.id, { mode: "delta", value: -2 });
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(4);
  });

  it("expired reservations do not block stock adjustment", async () => {
    const { user, product } = await seedWithReservation(10, 4);
    const order = getMemoryStore().orders[0];
    order.reservationExpiresAt = new Date(Date.now() - 60_000);
    memAdjustProductStock(user.id, product.id, { mode: "set", value: 0 });
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(0);
  });

  it("updateProduct stock path uses reservation protection", async () => {
    const { updateProduct } = await import("@/lib/server/repo");
    const { user, product } = await seedWithReservation(10, 4);
    await expect(
      updateProduct(user.id, product.id, { stock: 2 })
    ).rejects.toThrow(/reserved quantity/i);
    const ok = await updateProduct(user.id, product.id, { stock: 4 });
    expect(ok.stock).toBe(4);
  });
});
