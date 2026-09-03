import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
  memCreatePendingOrder,
  memConfirmPaidOrder,
  getMemoryStore,
} from "@/lib/server/memory-repo";
import { updateOrderStatus } from "@/lib/server/repo";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
});

afterEach(() => {
  resetMemoryStore();
});

async function seedRefundRequired() {
  const user = await memSignup({
    email: `seller-${Math.random().toString(16).slice(2)}@example.com`,
    password: "password12",
    fullName: "Seller",
  });
  const store = memCreateStore({ ownerId: user.id, name: "Status Shop" });
  const product = memCreateProduct({
    ownerId: user.id,
    storeId: store.id,
    name: "Item",
    priceKobo: 10000,
    stock: 1,
  });
  const ref = `ref_${Math.random().toString(16).slice(2)}`;
  const { order } = memCreatePendingOrder({
    storeId: store.id,
    customerName: "Buyer",
    customerPhone: "08011111111",
    customerEmail: "buyer@example.com",
    deliveryAddress: "Lagos",
    items: [{ productId: product.id, quantity: 1 }],
    paymentReference: ref,
  });
  // Deplete stock after order created
  getMemoryStore().products.find((p) => p.id === product.id)!.stock = 0;
  const result = memConfirmPaidOrder(ref, 10000);
  expect(result.refundRequired).toBe(true);
  return { user, order, ref };
}

async function seedConfirmed() {
  const user = await memSignup({
    email: `ok-${Math.random().toString(16).slice(2)}@example.com`,
    password: "password12",
    fullName: "Seller",
  });
  const store = memCreateStore({ ownerId: user.id, name: "Ok Shop Place" });
  const product = memCreateProduct({
    ownerId: user.id,
    storeId: store.id,
    name: "Item",
    priceKobo: 10000,
    stock: 5,
  });
  const ref = `ref_${Math.random().toString(16).slice(2)}`;
  const { order } = memCreatePendingOrder({
    storeId: store.id,
    customerName: "Buyer",
    customerPhone: "08011111111",
    customerEmail: "buyer@example.com",
    deliveryAddress: "Lagos",
    items: [{ productId: product.id, quantity: 1 }],
    paymentReference: ref,
  });
  memConfirmPaidOrder(ref, 10000);
  return { user, order };
}

describe("refund_required is terminal", () => {
  for (const status of [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
  ] as const) {
    it(`cannot transition refund_required → ${status}`, async () => {
      const { user, order } = await seedRefundRequired();
      await expect(
        updateOrderStatus(user.id, order.id, status)
      ).rejects.toThrow(/refund/i);
      const current = getMemoryStore().orders.find((o) => o.id === order.id)!;
      expect(current.orderStatus).toBe("refund_required");
      expect(current.paymentStatus).toBe("paid");
    });
  }

  it("refund_required remains paid", async () => {
    const { order } = await seedRefundRequired();
    const current = getMemoryStore().orders.find((o) => o.id === order.id)!;
    expect(current.paymentStatus).toBe("paid");
    expect(current.orderStatus).toBe("refund_required");
  });
});

describe("normal fulfillment transitions", () => {
  it("confirmed can move to processing/shipped/delivered", async () => {
    const { user, order } = await seedConfirmed();
    let updated = await updateOrderStatus(user.id, order.id, "processing");
    expect(updated.orderStatus).toBe("processing");
    updated = await updateOrderStatus(user.id, order.id, "shipped");
    expect(updated.orderStatus).toBe("shipped");
    updated = await updateOrderStatus(user.id, order.id, "delivered");
    expect(updated.orderStatus).toBe("delivered");
  });

  it("rejects unknown status values", async () => {
    const { user, order } = await seedConfirmed();
    await expect(
      updateOrderStatus(user.id, order.id, "refund_required")
    ).rejects.toThrow(/Invalid order status/);
  });
});
