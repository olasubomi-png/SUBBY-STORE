import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
} from "@/lib/server/memory-repo";
import { createPendingOrder, confirmPaidOrder } from "@/lib/server/repo";
import {
  classifyCustomer,
  customerIdentityKey,
  listCustomersForOwner,
  getCustomerDetailForOwner,
  VIP_SPEND_KOBO,
} from "@/lib/server/customers";
import { customerContactLinks } from "@/lib/customers/types";
import { GET as listGET } from "@/app/api/customers/route";
import { GET as detailGET } from "@/app/api/customers/[key]/route";
import * as auth from "@/lib/server/auth";
import { vi } from "vitest";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
});
afterEach(() => {
  resetMemoryStore();
  vi.restoreAllMocks();
});

describe("customer identity & classification", () => {
  it("prefers email key", () => {
    expect(customerIdentityKey("A@Ex.COM", "08012345678")).toBe("e:a@ex.com");
  });

  it("falls back to phone digits", () => {
    expect(customerIdentityKey("", "0801-234-5678")).toBe("p:08012345678");
  });

  it("returns null for weak identity", () => {
    expect(customerIdentityKey("", "123")).toBeNull();
  });

  it("classifies new / returning / vip", () => {
    expect(classifyCustomer(1, 10_000)).toBe("new");
    expect(classifyCustomer(2, 10_000)).toBe("returning");
    expect(classifyCustomer(1, VIP_SPEND_KOBO)).toBe("vip");
    expect(classifyCustomer(5, 0)).toBe("vip");
  });

  it("builds contact links", () => {
    const c = customerContactLinks({
      phone: "08012345678",
      email: "a@b.com",
    });
    expect(c.tel).toBe("tel:08012345678");
    expect(c.whatsapp).toBe("https://wa.me/2348012345678");
    expect(c.mailto).toBe("mailto:a@b.com");
  });
});

describe("customer aggregation", () => {
  async function seedPaidOrder(opts: {
    ownerId: number;
    storeId: number;
    productId: number;
    email: string;
    phone: string;
    name: string;
    totalKobo?: number;
  }) {
    const ref = `ss_cust_${Math.random().toString(16).slice(2)}`;
    // product price drives total
    const { order } = await createPendingOrder({
      storeId: opts.storeId,
      customerName: opts.name,
      customerPhone: opts.phone,
      customerEmail: opts.email,
      deliveryAddress: "Lagos",
      items: [{ productId: opts.productId, quantity: 1 }],
      paymentReference: ref,
    });
    await confirmPaidOrder(ref, order.totalKobo);
    return order;
  }

  it("aggregates repeat customers by email", async () => {
    const user = await memSignup({
      email: "seller@ex.com",
      password: "password12",
      fullName: "Seller",
    });
    const shop = memCreateStore({
      ownerId: user.id,
      name: "Shop",
      slug: "custshop",
    });
    const product = memCreateProduct({
      ownerId: user.id,
      storeId: shop.id,
      name: "Item",
      priceKobo: 100_000,
      stock: 20,
    });
    await seedPaidOrder({
      ownerId: user.id,
      storeId: shop.id,
      productId: product.id,
      email: "buyer@ex.com",
      phone: "08011111111",
      name: "Buyer One",
    });
    await seedPaidOrder({
      ownerId: user.id,
      storeId: shop.id,
      productId: product.id,
      email: "buyer@ex.com",
      phone: "08011111111",
      name: "Buyer One",
    });

    const { customers, insights } = await listCustomersForOwner(user.id);
    expect(customers).toHaveLength(1);
    expect(customers[0].paidOrders).toBe(2);
    expect(customers[0].type).toBe("returning");
    expect(insights.totalCustomers).toBe(1);
    expect(insights.returningCustomers).toBe(1);
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
    const shopA = memCreateStore({ ownerId: a.id, name: "A", slug: "shopa" });
    const shopB = memCreateStore({ ownerId: b.id, name: "B", slug: "shopb" });
    const pA = memCreateProduct({
      ownerId: a.id,
      storeId: shopA.id,
      name: "PA",
      priceKobo: 50_000,
      stock: 5,
    });
    const pB = memCreateProduct({
      ownerId: b.id,
      storeId: shopB.id,
      name: "PB",
      priceKobo: 50_000,
      stock: 5,
    });
    await seedPaidOrder({
      ownerId: a.id,
      storeId: shopA.id,
      productId: pA.id,
      email: "shared@ex.com",
      phone: "08022222222",
      name: "Shared",
    });
    await seedPaidOrder({
      ownerId: b.id,
      storeId: shopB.id,
      productId: pB.id,
      email: "shared@ex.com",
      phone: "08022222222",
      name: "Shared",
    });

    const listA = await listCustomersForOwner(a.id);
    const listB = await listCustomersForOwner(b.id);
    expect(listA.customers).toHaveLength(1);
    expect(listB.customers).toHaveLength(1);
    // detail for A cannot see B's order totals beyond A's own
    const detail = await getCustomerDetailForOwner(
      a.id,
      listA.customers[0].key
    );
    expect(detail?.paidOrders).toBe(1);
  });

  it("API requires auth and scopes to session", async () => {
    vi.spyOn(auth, "getSession").mockResolvedValue(null);
    const res = await listGET();
    expect(res.status).toBe(401);

    const user = await memSignup({
      email: "api@ex.com",
      password: "password12",
      fullName: "Api",
    });
    memCreateStore({ ownerId: user.id, name: "API", slug: "apishop" });
    vi.spyOn(auth, "getSession").mockResolvedValue({
      userId: user.id,
      email: user.email,
    });
    const ok = await listGET();
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(body.customers).toEqual([]);
    expect(body.insights.totalCustomers).toBe(0);
  });

  it("detail returns 404 for unknown customer of owner", async () => {
    const user = await memSignup({
      email: "d@ex.com",
      password: "password12",
      fullName: "D",
    });
    memCreateStore({ ownerId: user.id, name: "D", slug: "dshop" });
    vi.spyOn(auth, "getSession").mockResolvedValue({
      userId: user.id,
      email: user.email,
    });
    const res = await detailGET(new Request("http://localhost"), {
      params: Promise.resolve({ key: encodeURIComponent("e:nobody@ex.com") }),
    });
    expect(res.status).toBe(404);
  });
});
