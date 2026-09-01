import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
  memCreatePendingOrder,
  memConfirmPaidOrder,
  memConfirmPaidOrderWithEvent,
  getMemoryStore,
} from "@/lib/server/memory-repo";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
});

afterEach(() => {
  resetMemoryStore();
});

async function seedPaidPath(stock = 5) {
  const user = await memSignup({
    email: `seller-${Math.random().toString(16).slice(2)}@example.com`,
    password: "password12",
    fullName: "Seller",
  });
  const store = memCreateStore({ ownerId: user.id, name: "Shop" });
  const product = memCreateProduct({
    ownerId: user.id,
    storeId: store.id,
    name: "Shirt",
    priceKobo: 30000,
    stock,
  });
  const ref = `ref_${Math.random().toString(16).slice(2)}`;
  memCreatePendingOrder({
    storeId: store.id,
    customerName: "C",
    customerPhone: "08011111111",
    customerEmail: "c@example.com",
    deliveryAddress: "Lagos Island",
    items: [{ productId: product.id, quantity: 1 }],
    paymentReference: ref,
  });
  return { ref, productId: product.id, totalKobo: 30000 };
}

describe("payment confirmation concurrency", () => {
  it("first webhook deducts stock once", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath();
    const result = await memConfirmPaidOrderWithEvent(ref, totalKobo, "evt_first");
    expect(result.alreadyPaid).toBe(false);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      4
    );
  });

  it("duplicate webhook does not touch stock", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath();
    await memConfirmPaidOrderWithEvent(ref, totalKobo, "evt_a");
    const dup = await memConfirmPaidOrderWithEvent(ref, totalKobo, "evt_b");
    expect(dup.alreadyPaid).toBe(true);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      4
    );
  });

  it("duplicate event ID is idempotent", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath();
    const a = await memConfirmPaidOrderWithEvent(ref, totalKobo, "evt_same");
    const b = await memConfirmPaidOrderWithEvent(ref, totalKobo, "evt_same");
    expect(a.alreadyPaid).toBe(false);
    expect(b.alreadyPaid).toBe(true);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      4
    );
  });

  it("duplicate verification is idempotent", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath();
    const a = memConfirmPaidOrder(ref, totalKobo);
    const b = memConfirmPaidOrder(ref, totalKobo);
    expect(a.alreadyPaid).toBe(false);
    expect(b.alreadyPaid).toBe(true);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      4
    );
  });

  it("concurrent confirmations deduct stock exactly once", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath(10);
    const results = await Promise.all([
      memConfirmPaidOrderWithEvent(ref, totalKobo, "evt_c1"),
      memConfirmPaidOrderWithEvent(ref, totalKobo, "evt_c2"),
      memConfirmPaidOrderWithEvent(ref, totalKobo, "evt_c3"),
    ]);
    const firsts = results.filter((r) => !r.alreadyPaid);
    const dups = results.filter((r) => r.alreadyPaid);
    expect(firsts).toHaveLength(1);
    expect(dups).toHaveLength(2);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      9
    );
  });

  it("insufficient stock fails without marking paid", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath(1);
    const product = getMemoryStore().products.find((p) => p.id === productId)!;
    product.stock = 0; // depleted after order was created
    expect(() => memConfirmPaidOrder(ref, totalKobo)).toThrow(/stock/i);
    const order = getMemoryStore().orders.find((o) => o.paymentReference === ref)!;
    expect(order.paymentStatus).toBe("pending");
    expect(product.stock).toBe(0);
  });
});
