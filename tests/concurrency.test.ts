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

  it("webhook + verify racing simultaneously deducts stock once", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath(10);
    const [webhook, verify] = await Promise.all([
      memConfirmPaidOrderWithEvent(ref, totalKobo, "evt_webhook"),
      memConfirmPaidOrderWithEvent(ref, totalKobo, null), // verify path has no event id
    ]);
    const paidOnce = [webhook, verify].filter((r) => !r.alreadyPaid);
    const already = [webhook, verify].filter((r) => r.alreadyPaid);
    expect(paidOnce).toHaveLength(1);
    expect(already).toHaveLength(1);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      9
    );
  });

  it("incorrect amount is rejected", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath();
    expect(() => memConfirmPaidOrder(ref, totalKobo - 1)).toThrow(/mismatch/);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      5
    );
  });

  it("already-paid order stays paid on reconfirm", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath();
    memConfirmPaidOrder(ref, totalKobo);
    const again = memConfirmPaidOrder(ref, totalKobo);
    expect(again.alreadyPaid).toBe(true);
    expect(again.order.paymentStatus).toBe("paid");
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      4
    );
  });

  it("failed payment cannot be confirmed", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath();
    const { memMarkOrderPaymentFailed } = await import(
      "@/lib/server/memory-repo"
    );
    memMarkOrderPaymentFailed(ref);
    expect(() => memConfirmPaidOrder(ref, totalKobo)).toThrow(/failed/);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      5
    );
  });

  it("insufficient stock marks refund_required without changing stock", async () => {
    const { ref, productId, totalKobo } = await seedPaidPath(1);
    const product = getMemoryStore().products.find((p) => p.id === productId)!;
    product.stock = 0; // depleted after order was created
    const result = memConfirmPaidOrder(ref, totalKobo);
    expect(result.refundRequired).toBe(true);
    expect(result.alreadyPaid).toBe(false);
    const order = getMemoryStore().orders.find((o) => o.paymentReference === ref)!;
    expect(order.paymentStatus).toBe("paid");
    expect(order.orderStatus).toBe("refund_required");
    expect(product.stock).toBe(0);
  });

  it("concurrent last-item purchases: one confirmed, one refund_required, stock never negative", async () => {
    const user = await memSignup({
      email: "race@example.com",
      password: "password12",
      fullName: "Seller",
    });
    const shop = memCreateStore({ ownerId: user.id, name: "Race Shop" });
    const product = memCreateProduct({
      ownerId: user.id,
      storeId: shop.id,
      name: "Last Unit",
      priceKobo: 10000,
      stock: 1,
    });

    const refA = "ref_race_a";
    const refB = "ref_race_b";
    memCreatePendingOrder({
      storeId: shop.id,
      customerName: "A",
      customerPhone: "08011111111",
      customerEmail: "a@example.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: refA,
    });
    memCreatePendingOrder({
      storeId: shop.id,
      customerName: "B",
      customerPhone: "08022222222",
      customerEmail: "b@example.com",
      deliveryAddress: "Abuja",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: refB,
    });

    const [a, b] = await Promise.all([
      memConfirmPaidOrderWithEvent(refA, 10000, "evt_race_a"),
      memConfirmPaidOrderWithEvent(refB, 10000, "evt_race_b"),
    ]);

    const orders = getMemoryStore().orders.filter(
      (o) => o.paymentReference === refA || o.paymentReference === refB
    );
    const confirmed = orders.filter((o) => o.orderStatus === "confirmed");
    const refunds = orders.filter((o) => o.orderStatus === "refund_required");
    expect(confirmed).toHaveLength(1);
    expect(refunds).toHaveLength(1);
    expect(confirmed[0].paymentStatus).toBe("paid");
    expect(refunds[0].paymentStatus).toBe("paid");
    expect(getMemoryStore().products.find((p) => p.id === product.id)!.stock).toBe(
      0
    );
    // one of a/b is refundRequired
    expect([a.refundRequired, b.refundRequired].filter(Boolean)).toHaveLength(1);
  });

  it("multi-product failure is atomic (no partial stock decrement)", async () => {
    const user = await memSignup({
      email: "multi@example.com",
      password: "password12",
      fullName: "Seller",
    });
    const shop = memCreateStore({ ownerId: user.id, name: "Multi Shop" });
    const a = memCreateProduct({
      ownerId: user.id,
      storeId: shop.id,
      name: "Product A",
      priceKobo: 10000,
      stock: 5,
    });
    const b = memCreateProduct({
      ownerId: user.id,
      storeId: shop.id,
      name: "Product B",
      priceKobo: 5000,
      stock: 1,
    });
    const ref = "ref_multi";
    memCreatePendingOrder({
      storeId: shop.id,
      customerName: "C",
      customerPhone: "08033333333",
      customerEmail: "c@example.com",
      deliveryAddress: "Ibadan",
      items: [
        { productId: a.id, quantity: 2 },
        { productId: b.id, quantity: 1 },
      ],
      paymentReference: ref,
    });
    // deplete B after order created
    getMemoryStore().products.find((p) => p.id === b.id)!.stock = 0;

    const result = memConfirmPaidOrder(ref, 25000);
    expect(result.refundRequired).toBe(true);
    expect(getMemoryStore().products.find((p) => p.id === a.id)!.stock).toBe(5);
    expect(getMemoryStore().products.find((p) => p.id === b.id)!.stock).toBe(0);
    const order = getMemoryStore().orders.find((o) => o.paymentReference === ref)!;
    expect(order.orderStatus).toBe("refund_required");
    expect(order.paymentStatus).toBe("paid");
  });
});
