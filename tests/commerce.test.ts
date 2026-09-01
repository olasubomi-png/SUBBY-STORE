import { afterEach, describe, expect, it } from "vitest";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
  memCreatePendingOrder,
  memConfirmPaidOrder,
  memGetStoreForOwner,
  memListOrdersForOwner,
  memDashboardStats,
} from "@/lib/server/memory-repo";

afterEach(() => {
  resetMemoryStore();
});

describe("ownership", () => {
  it("blocks cross-owner store access", async () => {
    const a = await memSignup({
      email: "a@example.com",
      password: "password12",
      fullName: "Ada",
    });
    const b = await memSignup({
      email: "b@example.com",
      password: "password12",
      fullName: "Bola",
    });
    const store = memCreateStore({ ownerId: a.id, name: "Ada Fashion" });
    expect(() => memGetStoreForOwner(store.id, b.id)).toThrow(/Forbidden/);
  });
});

describe("order + payment", () => {
  it("creates pending order with price snapshots and confirms once", async () => {
    const user = await memSignup({
      email: "seller@example.com",
      password: "password12",
      fullName: "Seller",
    });
    const store = memCreateStore({ ownerId: user.id, name: "Tola Fashion" });
    const product = memCreateProduct({
      ownerId: user.id,
      storeId: store.id,
      name: "Ankara Dress",
      priceKobo: 2500000,
      stock: 10,
    });

    const ref = "ss_test_ref_1";
    const { order, cart } = memCreatePendingOrder({
      storeId: store.id,
      customerName: "Customer",
      customerPhone: "08012345678",
      customerEmail: "c@example.com",
      deliveryAddress: "12 Broad Street, Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: ref,
    });

    expect(order.totalKobo).toBe(2500000);
    expect(cart.totalKobo).toBe(2500000);
    expect(order.paymentStatus).toBe("pending");

    const first = memConfirmPaidOrder(ref, 2500000);
    expect(first.alreadyPaid).toBe(false);
    expect(first.order.paymentStatus).toBe("paid");
    expect(first.order.orderStatus).toBe("confirmed");

    const second = memConfirmPaidOrder(ref, 2500000);
    expect(second.alreadyPaid).toBe(true);

    const orders = memListOrdersForOwner(user.id);
    expect(orders).toHaveLength(1);

    const stats = memDashboardStats(user.id);
    expect(stats.salesKobo).toBe(2500000);
    expect(stats.orderCount).toBe(1);
  });

  it("rejects amount mismatch", async () => {
    const user = await memSignup({
      email: "s2@example.com",
      password: "password12",
      fullName: "Seller",
    });
    const store = memCreateStore({ ownerId: user.id, name: "Shop" });
    const product = memCreateProduct({
      ownerId: user.id,
      storeId: store.id,
      name: "Item",
      priceKobo: 100000,
      stock: 3,
    });
    memCreatePendingOrder({
      storeId: store.id,
      customerName: "C",
      customerPhone: "0801",
      customerEmail: "c@x.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: "ref_mismatch",
    });
    expect(() => memConfirmPaidOrder("ref_mismatch", 999)).toThrow(/mismatch/);
  });
});
