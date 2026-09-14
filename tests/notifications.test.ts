import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
} from "@/lib/server/memory-repo";
import { createPendingOrder, confirmPaidOrder, adjustProductStock } from "@/lib/server/repo";
import {
  listNotificationsForOwner,
  createNotification,
  markNotificationRead,
  markAllNotificationsRead,
} from "@/lib/server/notifications";
import { GET as listGET, PATCH as listPATCH } from "@/app/api/notifications/route";
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

async function sellerWithProduct() {
  const user = await memSignup({
    email: `n${Math.random().toString(16).slice(2)}@ex.com`,
    password: "password12",
    fullName: "Seller",
  });
  const shop = memCreateStore({
    ownerId: user.id,
    name: "N Shop",
    slug: `nshop${user.id}`,
  });
  const product = memCreateProduct({
    ownerId: user.id,
    storeId: shop.id,
    name: "Widget",
    priceKobo: 100_000,
    stock: 10,
  });
  return { user, shop, product };
}

describe("notifications", () => {
  it("creates order and payment notifications with dedupe", async () => {
    const { user, shop, product } = await sellerWithProduct();
    const ref = `ss_n_${Math.random().toString(16).slice(2)}`;
    const { order } = await createPendingOrder({
      storeId: shop.id,
      customerName: "Buyer",
      customerPhone: "08012345678",
      customerEmail: "buyer@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: ref,
    });
    let { notifications } = await listNotificationsForOwner(user.id);
    expect(
      notifications.some((n) => n.type === "order_created")
    ).toBe(true);

    await confirmPaidOrder(ref, order.totalKobo);
    await confirmPaidOrder(ref, order.totalKobo); // idempotent

    ({ notifications } = await listNotificationsForOwner(user.id));
    const payments = notifications.filter(
      (n) => n.type === "payment_confirmed"
    );
    expect(payments).toHaveLength(1);
  });

  it("dedupes explicit createNotification", async () => {
    const { shop } = await sellerWithProduct();
    const a = await createNotification({
      storeId: shop.id,
      type: "low_stock",
      title: "Low",
      message: "x",
      dedupeKey: "low_stock:1",
    });
    const b = await createNotification({
      storeId: shop.id,
      type: "low_stock",
      title: "Low",
      message: "x",
      dedupeKey: "low_stock:1",
    });
    expect(a).not.toBeNull();
    expect(b).toBeNull();
  });

  it("notifies on low stock adjustment", async () => {
    const { user, product } = await sellerWithProduct();
    await adjustProductStock(user.id, product.id, { mode: "set", value: 2 });
    const { notifications } = await listNotificationsForOwner(user.id);
    expect(notifications.some((n) => n.type === "low_stock")).toBe(true);
  });

  it("isolates sellers", async () => {
    const a = await sellerWithProduct();
    const b = await sellerWithProduct();
    await createNotification({
      storeId: a.shop.id,
      type: "order_created",
      title: "A only",
      message: "private",
      dedupeKey: "order_created:999",
    });
    const listB = await listNotificationsForOwner(b.user.id);
    expect(listB.notifications.some((n) => n.title === "A only")).toBe(false);
  });

  it("mark read and mark all", async () => {
    const { user, shop } = await sellerWithProduct();
    const n = await createNotification({
      storeId: shop.id,
      type: "order_created",
      title: "T",
      message: "M",
      dedupeKey: "order_created:42",
    });
    expect(n).not.toBeNull();
    const ok = await markNotificationRead(user.id, n!.id);
    expect(ok).toBe(true);
    await createNotification({
      storeId: shop.id,
      type: "payment_confirmed",
      title: "P",
      message: "M",
      dedupeKey: "payment_confirmed:42",
    });
    const marked = await markAllNotificationsRead(user.id);
    expect(marked).toBeGreaterThanOrEqual(1);
    const { unreadCount } = await listNotificationsForOwner(user.id);
    expect(unreadCount).toBe(0);
  });

  it("API requires auth", async () => {
    vi.spyOn(auth, "getSession").mockResolvedValue(null);
    const res = await listGET(new Request("http://localhost/api/notifications"));
    expect(res.status).toBe(401);
  });

  it("API lists for session owner", async () => {
    const { user, shop } = await sellerWithProduct();
    await createNotification({
      storeId: shop.id,
      type: "order_created",
      title: "Hello",
      message: "World",
      dedupeKey: "order_created:7",
    });
    vi.spyOn(auth, "getSession").mockResolvedValue({
      userId: user.id,
      email: user.email,
    });
    const res = await listGET(new Request("http://localhost/api/notifications"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unreadCount).toBeGreaterThanOrEqual(1);
    expect(body.notifications.length).toBeGreaterThanOrEqual(1);

    const patch = await listPATCH(
      new Request("http://localhost/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAllRead: true }),
      })
    );
    expect(patch.status).toBe(200);
  });
});
