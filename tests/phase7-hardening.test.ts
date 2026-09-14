import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
  getMemoryStore,
} from "@/lib/server/memory-repo";
import { GET as publicStoreGET } from "@/app/api/public/store/[slug]/route";
import { POST as eventsPOST } from "@/app/api/events/route";
import * as auth from "@/lib/server/auth";
import { confirmPaidOrder, createPendingOrder } from "@/lib/server/repo";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
});
afterEach(() => {
  resetMemoryStore();
  vi.restoreAllMocks();
});

describe("public store API fields", () => {
  it("exposes branding and product public fields", async () => {
    const user = await memSignup({
      email: "pub@ex.com",
      password: "password12",
      fullName: "Pub",
    });
    const shop = memCreateStore({
      ownerId: user.id,
      name: "Public Shop",
      slug: "pubshop",
      description: "Hello store",
    });
    memCreateProduct({
      ownerId: user.id,
      storeId: shop.id,
      name: "Item",
      priceKobo: 50000,
      stock: 3,
      category: "Gadgets",
    });

    const res = await publicStoreGET(
      new Request("http://localhost/api/public/store/pubshop"),
      { params: Promise.resolve({ slug: "pubshop" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.store.name).toBe("Public Shop");
    expect(body.store.description).toBe("Hello store");
    expect(body.store).toHaveProperty("logoUrl");
    expect(body.store).toHaveProperty("whatsapp");
    expect(body.store).toHaveProperty("instagramUrl");
    expect(body.products[0]).toMatchObject({
      name: "Item",
      category: "Gadgets",
      active: true,
    });
    expect(body.products[0]).toHaveProperty("featured");
  });
});

describe("event product/store validation", () => {
  it("ignores productId that does not belong to store", async () => {
    const user = await memSignup({
      email: "ev@ex.com",
      password: "password12",
      fullName: "Ev",
    });
    const shop = memCreateStore({
      ownerId: user.id,
      name: "Ev Shop",
      slug: "evshop",
    });
    const res = await eventsPOST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug: "evshop",
          eventType: "product_view",
          productId: 999999,
        }),
      })
    );
    expect(res.status).toBe(200);
    const events = getMemoryStore().storeEvents.filter(
      (e) => e.storeId === shop.id
    );
    // event may be recorded without productId
    const withBad = events.filter((e) => e.productId === 999999);
    expect(withBad).toHaveLength(0);
  });

  it("rejects client purchase_completed", async () => {
    const user = await memSignup({
      email: "pc@ex.com",
      password: "password12",
      fullName: "Pc",
    });
    memCreateStore({ ownerId: user.id, name: "PC Shop", slug: "pcshop" });
    const res = await eventsPOST(
      new Request("http://localhost/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          storeSlug: "pcshop",
          eventType: "purchase_completed",
        }),
      })
    );
    expect(res.status).toBe(400);
  });
});

describe("purchase_completed server event", () => {
  it("records once after successful payment confirmation", async () => {
    const user = await memSignup({
      email: "pay@ex.com",
      password: "password12",
      fullName: "Pay",
    });
    const shop = memCreateStore({
      ownerId: user.id,
      name: "Pay Shop",
      slug: "payshop",
    });
    const product = memCreateProduct({
      ownerId: user.id,
      storeId: shop.id,
      name: "Widget",
      priceKobo: 100000,
      stock: 5,
    });
    const ref = `ss_test_${Math.random().toString(16).slice(2)}`;
    const { order, cart } = await createPendingOrder({
      storeId: shop.id,
      customerName: "Buyer",
      customerPhone: "080",
      customerEmail: "buyer@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: ref,
    });
    await confirmPaidOrder(ref, cart.totalKobo);
    const purchases = getMemoryStore().storeEvents.filter(
      (e) => e.eventType === "purchase_completed" && e.storeId === shop.id
    );
    expect(purchases.length).toBeGreaterThanOrEqual(1);
    // idempotent second confirm
    await confirmPaidOrder(ref, cart.totalKobo);
    const after = getMemoryStore().storeEvents.filter(
      (e) => e.eventType === "purchase_completed" && e.storeId === shop.id
    );
    expect(after).toHaveLength(purchases.length);
  });
});
