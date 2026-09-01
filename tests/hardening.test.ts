import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  allowMemoryDb,
  assertProductionConfig,
  isPaystackMockMode,
  isProduction,
  requireDatabaseUrl,
  requirePaystackSecret,
  requireSessionSecret,
} from "@/lib/server/config";
import { mergeCartItems, priceCart } from "@/lib/server/cart";
import {
  resetMemoryStore,
  memSignup,
  memLogin,
  memCreateStore,
  memCreateProduct,
  memCreatePendingOrder,
  memConfirmPaidOrder,
  memConfirmPaidOrderWithEvent,
  memMarkOrderPaymentFailed,
  memGetStoreForOwner,
  memListOrdersForOwner,
  getMemoryStore,
} from "@/lib/server/memory-repo";

const secret = "test_session_secret_at_least_32_chars_xx";

beforeEach(() => {
  resetMemoryStore();
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  process.env.USE_MEMORY_DB = "1";
  process.env.SESSION_SECRET = secret;
  process.env.PAYSTACK_SECRET_KEY = "sk_test_REPLACE";
  delete process.env.PAYSTACK_MODE;
  delete process.env.DATABASE_URL;
});

afterEach(() => {
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  process.env.USE_MEMORY_DB = "1";
});

describe("production config guards", () => {
  it("allows memory only outside production with explicit flags", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
    process.env.USE_MEMORY_DB = "1";
    expect(allowMemoryDb()).toBe(true);
  });

  it("fails production without DATABASE_URL", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    delete process.env.DATABASE_URL;
    expect(() => requireDatabaseUrl()).toThrow(/DATABASE_URL/);
    expect(() => assertProductionConfig()).toThrow(/DATABASE_URL/);
  });

  it("forbids PAYSTACK_MODE=mock in production", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.SESSION_SECRET = secret;
    process.env.PAYSTACK_MODE = "mock";
    process.env.PAYSTACK_SECRET_KEY = "sk_live_realkey1234567890";
    process.env.APP_URL = "https://example.com";
    expect(() => isPaystackMockMode()).toThrow(/mock/);
  });

  it("forbids REPLACE placeholder Paystack key in production", () => {
    (process.env as { NODE_ENV?: string }).NODE_ENV = "production";
    process.env.DATABASE_URL = "postgresql://u:p@localhost:5432/db";
    process.env.SESSION_SECRET = secret;
    process.env.PAYSTACK_SECRET_KEY = "sk_test_REPLACE";
    process.env.APP_URL = "https://example.com";
    delete process.env.PAYSTACK_MODE;
    expect(() => requirePaystackSecret()).toThrow(/placeholder|REPLACE/i);
  });

  it("requires SESSION_SECRET length", () => {
    process.env.SESSION_SECRET = "short";
    expect(() => requireSessionSecret()).toThrow(/32/);
  });
});

describe("authentication", () => {
  it("signs up and logs in", async () => {
    const user = await memSignup({
      email: "owner@example.com",
      password: "password12",
      fullName: "Owner",
    });
    expect(user.email).toBe("owner@example.com");
    const logged = await memLogin("owner@example.com", "password12");
    expect(logged.id).toBe(user.id);
  });

  it("rejects duplicate email", async () => {
    await memSignup({
      email: "dup@example.com",
      password: "password12",
      fullName: "A",
    });
    await expect(
      memSignup({
        email: "dup@example.com",
        password: "password12",
        fullName: "B",
      })
    ).rejects.toThrow(/already/i);
  });

  it("rejects invalid password", async () => {
    await memSignup({
      email: "x@example.com",
      password: "password12",
      fullName: "X",
    });
    await expect(memLogin("x@example.com", "wrongpass")).rejects.toThrow(
      /Invalid/
    );
  });
});

describe("authorization", () => {
  it("blocks cross-owner store and order access", async () => {
    const a = await memSignup({
      email: "a@example.com",
      password: "password12",
      fullName: "A",
    });
    const b = await memSignup({
      email: "b@example.com",
      password: "password12",
      fullName: "B",
    });
    const store = memCreateStore({ ownerId: a.id, name: "A Store" });
    expect(() => memGetStoreForOwner(store.id, b.id)).toThrow(/Forbidden/);
    expect(memListOrdersForOwner(b.id)).toHaveLength(0);
  });
});

describe("cart & stock", () => {
  it("merges duplicate product lines", () => {
    const merged = mergeCartItems([
      { productId: 1, quantity: 2 },
      { productId: 1, quantity: 3 },
    ]);
    expect(merged).toEqual([{ productId: 1, quantity: 5 }]);
  });

  it("rejects insufficient stock after merge", () => {
    expect(() =>
      priceCart(
        [
          { productId: 1, quantity: 3 },
          { productId: 1, quantity: 3 },
        ],
        [{ id: 1, name: "Item", priceKobo: 1000, stock: 5, active: true }]
      )
    ).toThrow(/stock/i);
  });

  it("uses server prices not client totals", () => {
    const cart = priceCart(
      [{ productId: 1, quantity: 2 }],
      [{ id: 1, name: "Item", priceKobo: 50000, stock: 10, active: true }]
    );
    expect(cart.totalKobo).toBe(100000);
  });
});

describe("payments idempotency", () => {
  async function seedOrder() {
    const user = await memSignup({
      email: "s@example.com",
      password: "password12",
      fullName: "Seller",
    });
    const store = memCreateStore({ ownerId: user.id, name: "Shop" });
    const product = memCreateProduct({
      ownerId: user.id,
      storeId: store.id,
      name: "Shirt",
      priceKobo: 30000,
      stock: 5,
    });
    const ref = "pay_ref_unique_1";
    memCreatePendingOrder({
      storeId: store.id,
      customerName: "C",
      customerPhone: "08011111111",
      customerEmail: "c@example.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: ref,
    });
    return { ref, productId: product.id, userId: user.id };
  }

  it("deducts stock once on success", async () => {
    const { ref, productId } = await seedOrder();
    const first = memConfirmPaidOrder(ref, 30000);
    expect(first.alreadyPaid).toBe(false);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      4
    );
    const second = memConfirmPaidOrder(ref, 30000);
    expect(second.alreadyPaid).toBe(true);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      4
    );
  });

  it("rejects amount mismatch", async () => {
    const { ref } = await seedOrder();
    expect(() => memConfirmPaidOrder(ref, 1)).toThrow(/mismatch/);
  });

  it("is idempotent on duplicate webhook event ids", async () => {
    const { ref, productId } = await seedOrder();
    const a = memConfirmPaidOrderWithEvent(ref, 30000, "evt_1");
    expect(a.alreadyPaid).toBe(false);
    const b = memConfirmPaidOrderWithEvent(ref, 30000, "evt_1");
    expect(b.alreadyPaid).toBe(true);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      4
    );
  });

  it("marks payment failed without touching stock", async () => {
    const { ref, productId } = await seedOrder();
    memMarkOrderPaymentFailed(ref);
    expect(getMemoryStore().products.find((p) => p.id === productId)!.stock).toBe(
      5
    );
    const order = getMemoryStore().orders.find((o) => o.paymentReference === ref)!;
    expect(order.paymentStatus).toBe("failed");
  });

  it("cannot fail an already paid order", async () => {
    const { ref } = await seedOrder();
    memConfirmPaidOrder(ref, 30000);
    expect(() => memMarkOrderPaymentFailed(ref)).toThrow(/paid/);
  });
});
