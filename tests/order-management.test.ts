import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
  getMemoryStore,
} from "@/lib/server/memory-repo";
import { createPendingOrder, confirmPaidOrder } from "@/lib/server/repo";
import {
  listOrdersManaged,
  updateFulfillmentStatus,
  bulkUpdateFulfillmentStatus,
  getOrderDetailForOwner,
  updateSellerNote,
} from "@/lib/server/order-management";
import { ALLOWED_TRANSITIONS } from "@/lib/orders/transitions";
import { GET as ordersGET, PATCH as ordersPATCH } from "@/app/api/orders/route";
import * as auth from "@/lib/server/auth";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
});
afterEach(() => {
  resetMemoryStore();
  vi.restoreAllMocks();
});

async function seedPaid() {
  const user = await memSignup({
    email: `om${Math.random().toString(16).slice(2)}@ex.com`,
    password: "password12",
    fullName: "Seller",
  });
  const shop = memCreateStore({
    ownerId: user.id,
    name: "Shop",
    slug: `om${user.id}`,
  });
  const product = memCreateProduct({
    ownerId: user.id,
    storeId: shop.id,
    name: "Item",
    priceKobo: 100_000,
    stock: 20,
  });
  const ref = `ss_om_${Math.random().toString(16).slice(2)}`;
  const { order } = await createPendingOrder({
    storeId: shop.id,
    customerName: "Buyer",
    customerPhone: "08012345678",
    customerEmail: "buyer@ex.com",
    deliveryAddress: "Lagos",
    items: [{ productId: product.id, quantity: 1 }],
    paymentReference: ref,
  });
  await confirmPaidOrder(ref, order.totalKobo);
  return { user, shop, product, order, ref };
}

describe("order management", () => {
  it("filters and paginates", async () => {
    const { user } = await seedPaid();
    const result = await listOrdersManaged(user.id, {
      q: "buyer",
      page: 1,
      pageSize: 10,
    });
    expect(result.total).toBeGreaterThanOrEqual(1);
    expect(result.summary.paid).toBeGreaterThanOrEqual(1);
  });

  it("enforces transitions and protects refund_required", async () => {
    const { user, order } = await seedPaid();
    // paid order is confirmed
    await updateFulfillmentStatus(user.id, order.id, "processing");
    await updateFulfillmentStatus(user.id, order.id, "shipped");
    await updateFulfillmentStatus(user.id, order.id, "delivered");
    await expect(
      updateFulfillmentStatus(user.id, order.id, "processing")
    ).rejects.toThrow(/Cannot change status/);
  });

  it("bulk update returns per-order results", async () => {
    const a = await seedPaid();
    const b = await seedPaid();
    // b is different seller - a cannot update b
    const { results } = await bulkUpdateFulfillmentStatus(
      a.user.id,
      [a.order.id, b.order.id],
      "processing"
    );
    const ok = results.find((r) => r.orderId === a.order.id);
    const fail = results.find((r) => r.orderId === b.order.id);
    expect(ok?.ok).toBe(true);
    expect(fail?.ok).toBe(false);
  });

  it("cancel unpaid releases reserved stock", async () => {
    const user = await memSignup({
      email: "cancel@ex.com",
      password: "password12",
      fullName: "C",
    });
    const shop = memCreateStore({
      ownerId: user.id,
      name: "C",
      slug: "cshop",
    });
    const product = memCreateProduct({
      ownerId: user.id,
      storeId: shop.id,
      name: "P",
      priceKobo: 50_000,
      stock: 5,
    });
    const ref = `ss_c_${Math.random().toString(16).slice(2)}`;
    const { order } = await createPendingOrder({
      storeId: shop.id,
      customerName: "X",
      customerPhone: "08099999999",
      customerEmail: "x@ex.com",
      deliveryAddress: "Abuja",
      items: [{ productId: product.id, quantity: 2 }],
      paymentReference: ref,
    });
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(3);
    await updateFulfillmentStatus(user.id, order.id, "cancelled");
    expect(
      getMemoryStore().products.find((p) => p.id === product.id)!.stock
    ).toBe(5);
  });

  it("seller note and detail ownership", async () => {
    const { user, order } = await seedPaid();
    await updateSellerNote(user.id, order.id, "Pack carefully");
    const detail = await getOrderDetailForOwner(user.id, order.id);
    expect(detail?.order.sellerNote).toBe("Pack carefully");
    expect(detail?.items.length).toBeGreaterThanOrEqual(1);

    const other = await memSignup({
      email: "other@ex.com",
      password: "password12",
      fullName: "O",
    });
    const stolen = await getOrderDetailForOwner(other.id, order.id);
    expect(stolen).toBeNull();
  });

  it("API requires auth", async () => {
    vi.spyOn(auth, "getSession").mockResolvedValue(null);
    const res = await ordersGET(
      new Request("http://localhost/api/orders")
    );
    expect(res.status).toBe(401);
  });

  it("transition map has no path out of refund_required", () => {
    expect(ALLOWED_TRANSITIONS.refund_required).toEqual([]);
  });
});
