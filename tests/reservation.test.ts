import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
  memCreatePendingOrder,
  memConfirmPaidOrder,
  memMarkOrderPaymentFailed,
  memReleaseExpiredOrderReservations,
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

async function seedProduct(stock = 5, priceKobo = 10000) {
  const user = await memSignup({
    email: `s-${Math.random().toString(16).slice(2)}@ex.com`,
    password: "password12",
    fullName: "Seller",
  });
  const shop = memCreateStore({ ownerId: user.id, name: "Reserve Shop" });
  const product = memCreateProduct({
    ownerId: user.id,
    storeId: shop.id,
    name: "Widget",
    priceKobo,
    stock,
  });
  return { user, shop, product };
}

describe("reservation creation", () => {
  it("checkout reserves stock and creates pending order/payment", async () => {
    const { shop, product } = await seedProduct(5);
    const { order, cart } = await memCreatePendingOrder({
      storeId: shop.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: "b@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 2 }],
      paymentReference: "ref_res_1",
    });
    expect(order.stockReserved).toBe(true);
    expect(order.reservationExpiresAt).toBeTruthy();
    expect(order.paymentStatus).toBe("pending");
    expect(cart.totalKobo).toBe(20000);
    expect(getMemoryStore().products.find((p) => p.id === product.id)!.stock).toBe(
      3
    );
    expect(getMemoryStore().payments).toHaveLength(1);
    expect(getMemoryStore().payments[0].status).toBe("pending");
  });

  it("insufficient stock creates nothing", async () => {
    const { shop, product } = await seedProduct(1);
    await expect(
      memCreatePendingOrder({
        storeId: shop.id,
        customerName: "Buyer",
        customerPhone: "08011111111",
        customerEmail: "b@ex.com",
        deliveryAddress: "Lagos",
        items: [{ productId: product.id, quantity: 5 }],
        paymentReference: "ref_fail",
      })
    ).rejects.toThrow(/stock/i);
    expect(getMemoryStore().orders).toHaveLength(0);
    expect(getMemoryStore().payments).toHaveLength(0);
    expect(getMemoryStore().products.find((p) => p.id === product.id)!.stock).toBe(
      1
    );
  });

  it("merges duplicate cart lines for reservation qty", async () => {
    const { shop, product } = await seedProduct(10);
    await memCreatePendingOrder({
      storeId: shop.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: "b@ex.com",
      deliveryAddress: "Lagos",
      items: [
        { productId: product.id, quantity: 2 },
        { productId: product.id, quantity: 3 },
      ],
      paymentReference: "ref_merge",
    });
    expect(getMemoryStore().products.find((p) => p.id === product.id)!.stock).toBe(
      5
    );
    expect(getMemoryStore().orderItems[0].quantity).toBe(5);
  });
});

describe("payment success with reservation", () => {
  it("does not double-decrement stock", async () => {
    const { shop, product } = await seedProduct(5);
    await memCreatePendingOrder({
      storeId: shop.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: "b@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 2 }],
      paymentReference: "ref_ok",
    });
    expect(getMemoryStore().products.find((p) => p.id === product.id)!.stock).toBe(
      3
    );
    const result = memConfirmPaidOrder("ref_ok", 20000);
    expect(result.alreadyPaid).toBe(false);
    expect(result.refundRequired).toBe(false);
    expect(getMemoryStore().products.find((p) => p.id === product.id)!.stock).toBe(
      3
    );
    const order = getMemoryStore().orders[0];
    expect(order.paymentStatus).toBe("paid");
    expect(order.orderStatus).toBe("confirmed");
    expect(order.stockReserved).toBe(false);
    expect(order.reservationExpiresAt).toBeNull();
  });
});

describe("payment failure releases stock", () => {
  it("releases once and is idempotent", async () => {
    const { shop, product } = await seedProduct(5);
    await memCreatePendingOrder({
      storeId: shop.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: "b@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 2 }],
      paymentReference: "ref_fail_pay",
    });
    memMarkOrderPaymentFailed("ref_fail_pay");
    expect(getMemoryStore().products.find((p) => p.id === product.id)!.stock).toBe(
      5
    );
    memMarkOrderPaymentFailed("ref_fail_pay");
    expect(getMemoryStore().products.find((p) => p.id === product.id)!.stock).toBe(
      5
    );
    expect(getMemoryStore().orders[0].stockReserved).toBe(false);
    expect(getMemoryStore().orders[0].paymentStatus).toBe("failed");
  });
});

describe("expiration", () => {
  it("releases expired reservation once", async () => {
    const { shop, product } = await seedProduct(5);
    await memCreatePendingOrder({
      storeId: shop.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: "b@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 2 }],
      paymentReference: "ref_exp",
    });
    const order = getMemoryStore().orders[0];
    order.reservationExpiresAt = new Date(Date.now() - 1000);
    const a = memReleaseExpiredOrderReservations();
    expect(a.released).toBe(1);
    expect(getMemoryStore().products.find((p) => p.id === product.id)!.stock).toBe(
      5
    );
    expect(order.stockReserved).toBe(false);
    expect(order.orderStatus).toBe("expired");
    const b = memReleaseExpiredOrderReservations();
    expect(b.released).toBe(0);
  });

  it("does not release paid orders", async () => {
    const { shop, product } = await seedProduct(5);
    await memCreatePendingOrder({
      storeId: shop.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: "b@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: "ref_paid",
    });
    memConfirmPaidOrder("ref_paid", 10000);
    const order = getMemoryStore().orders[0];
    order.reservationExpiresAt = new Date(Date.now() - 1000);
    order.stockReserved = true; // force bad state
    const before = getMemoryStore().products.find((p) => p.id === product.id)!.stock;
    // paymentStatus paid → cleanup must skip
    const r = memReleaseExpiredOrderReservations();
    expect(r.released).toBe(0);
    expect(getMemoryStore().products.find((p) => p.id === product.id)!.stock).toBe(
      before
    );
  });
});
