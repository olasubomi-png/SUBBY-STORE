import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { computeDiscount, normalizeCouponCode } from "@/lib/coupons/math";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
  getMemoryStore,
} from "@/lib/server/memory-repo";
import {
  createCoupon,
  updateCoupon,
  deleteCoupon,
  validateCouponForCart,
  listCouponsForOwner,
} from "@/lib/server/coupons";
import { createPendingOrder } from "@/lib/server/repo";
import {
  seedMemoryPlans, ensureStoreSubscription, startSubscriptionCheckout, confirmSubscriptionPayment,
} from "@/lib/server/subscriptions";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  process.env.PAYSTACK_MODE = "mock";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  seedMemoryPlans();
});
afterEach(() => resetMemoryStore());


async function grantPro(ownerId: number, storeId: number, email: string) {
  await ensureStoreSubscription(storeId);
  const checkout = await startSubscriptionCheckout({ ownerId, storeId, planSlug: "pro", email });
  if (checkout.kind === "checkout") {
    await confirmSubscriptionPayment({
      reference: checkout.reference, amountKobo: checkout.amountKobo, rawEventId: `evt_${checkout.reference}`,
    });
  }
}

async function seed() {
  const user = await memSignup({
    email: `c-${Math.random().toString(16).slice(2)}@ex.com`,
    password: "password12",
    fullName: "Seller",
  });
  const shop = memCreateStore({
    ownerId: user.id,
    name: `Coupon Shop ${Math.random().toString(16).slice(2, 8)}`,
  });
  await grantPro(user.id, shop.id, user.email);
  const p1 = memCreateProduct({
    ownerId: user.id,
    storeId: shop.id,
    name: "Alpha",
    priceKobo: 1_000_000, // ₦10,000
    stock: 20,
  });
  const p2 = memCreateProduct({
    ownerId: user.id,
    storeId: shop.id,
    name: "Beta",
    priceKobo: 500_000, // ₦5,000
    stock: 20,
  });
  return { user, shop, p1, p2 };
}

describe("coupon math", () => {
  it("normalizes codes", () => {
    expect(normalizeCouponCode("  save10 ")).toBe("SAVE10");
  });

  it("percentage with max cap", () => {
    const r = computeDiscount({
      type: "percentage",
      value: 50,
      eligibleSubtotalKobo: 1_000_000,
      cartSubtotalKobo: 1_000_000,
      minimumOrderAmountKobo: 0,
      maximumDiscountAmountKobo: 200_000,
    });
    expect(r.discountKobo).toBe(200_000);
    expect(r.totalKobo).toBe(800_000);
  });

  it("fixed never exceeds cart", () => {
    const r = computeDiscount({
      type: "fixed",
      value: 9_999_000,
      eligibleSubtotalKobo: 100_000,
      cartSubtotalKobo: 100_000,
      minimumOrderAmountKobo: 0,
      maximumDiscountAmountKobo: null,
    });
    expect(r.discountKobo).toBe(100_000);
    expect(r.totalKobo).toBe(0);
  });
});

describe("coupon CRUD and validation", () => {
  it("creates lists and deactivates", async () => {
    const { user, shop } = await seed();
    const c = await createCoupon(user.id, {
      storeId: shop.id,
      code: "save10",
      type: "percentage",
      value: 10,
    });
    expect(c.code).toBe("SAVE10");
    const list = await listCouponsForOwner(user.id, shop.id);
    expect(list.some((x) => x.id === c.id)).toBe(true);
    await updateCoupon(user.id, c.id, { active: false });
    const v = await validateCouponForCart({
      storeId: shop.id,
      code: "SAVE10",
      lines: [{ productId: 1, lineTotalKobo: 1_000_000 }],
    });
    expect(v.ok).toBe(false);
  });

  it("percentage and fixed discounts", async () => {
    const { user, shop, p1 } = await seed();
    await createCoupon(user.id, {
      storeId: shop.id,
      code: "PCT10",
      type: "percentage",
      value: 10,
    });
    const pct = await validateCouponForCart({
      storeId: shop.id,
      code: "PCT10",
      lines: [{ productId: p1.id, lineTotalKobo: 1_000_000 }],
    });
    expect(pct.ok).toBe(true);
    if (pct.ok) {
      expect(pct.discountKobo).toBe(100_000);
      expect(pct.totalKobo).toBe(900_000);
    }

    await createCoupon(user.id, {
      storeId: shop.id,
      code: "FLAT2K",
      type: "fixed",
      value: 2000, // NGN
    });
    const fix = await validateCouponForCart({
      storeId: shop.id,
      code: "FLAT2K",
      lines: [{ productId: p1.id, lineTotalKobo: 1_000_000 }],
    });
    expect(fix.ok).toBe(true);
    if (fix.ok) {
      expect(fix.discountKobo).toBe(200_000);
    }
  });

  it("enforces minimum order and product targeting", async () => {
    const { user, shop, p1, p2 } = await seed();
    await createCoupon(user.id, {
      storeId: shop.id,
      code: "MIN",
      type: "fixed",
      value: 500,
      minimumOrderAmountNgn: 15000,
    });
    const low = await validateCouponForCart({
      storeId: shop.id,
      code: "MIN",
      lines: [{ productId: p1.id, lineTotalKobo: 1_000_000 }],
    });
    expect(low.ok).toBe(false);

    await createCoupon(user.id, {
      storeId: shop.id,
      code: "ONLYA",
      type: "percentage",
      value: 50,
      productIds: [p1.id],
    });
    const wrong = await validateCouponForCart({
      storeId: shop.id,
      code: "ONLYA",
      lines: [{ productId: p2.id, lineTotalKobo: 500_000 }],
    });
    expect(wrong.ok).toBe(false);
    const mixed = await validateCouponForCart({
      storeId: shop.id,
      code: "ONLYA",
      lines: [
        { productId: p1.id, lineTotalKobo: 1_000_000 },
        { productId: p2.id, lineTotalKobo: 500_000 },
      ],
    });
    expect(mixed.ok).toBe(true);
    if (mixed.ok) {
      // 50% of p1 only
      expect(mixed.discountKobo).toBe(500_000);
      expect(mixed.totalKobo).toBe(1_000_000);
    }
  });

  it("usage limit and order snapshot", async () => {
    const { user, shop, p1 } = await seed();
    await createCoupon(user.id, {
      storeId: shop.id,
      code: "ONCE",
      type: "percentage",
      value: 10,
      usageLimit: 1,
    });
    const order = await createPendingOrder({
      storeId: shop.id,
      customerName: "Buyer",
      customerPhone: "080",
      customerEmail: "buyer@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: p1.id, quantity: 1 }],
      paymentReference: `ref_${Math.random().toString(16).slice(2)}`,
      couponCode: "ONCE",
    });
    expect(order.order.discountKobo).toBe(100_000);
    expect(order.order.couponCode).toBe("ONCE");
    expect(order.order.totalKobo).toBe(900_000);
    expect(order.cart.totalKobo).toBe(900_000);

    await expect(
      createPendingOrder({
        storeId: shop.id,
        customerName: "Buyer2",
        customerPhone: "081",
        customerEmail: "buyer2@ex.com",
        deliveryAddress: "Abuja",
        items: [{ productId: p1.id, quantity: 1 }],
        paymentReference: `ref_${Math.random().toString(16).slice(2)}`,
        couponCode: "ONCE",
      })
    ).rejects.toThrow(/limit/i);
  });

  it("blocks cross-store access", async () => {
    const a = await seed();
    const b = await seed();
    const c = await createCoupon(a.user.id, {
      storeId: a.shop.id,
      code: "MINE",
      type: "percentage",
      value: 10,
    });
    await expect(
      updateCoupon(b.user.id, c.id, { active: false })
    ).rejects.toThrow();
    await expect(deleteCoupon(b.user.id, c.id)).rejects.toThrow();
  });

  it("rejects expired and future coupons", async () => {
    const { user, shop, p1 } = await seed();
    await createCoupon(user.id, {
      storeId: shop.id,
      code: "OLD",
      type: "percentage",
      value: 10,
      expiresAt: new Date(Date.now() - 60_000),
    });
    const expired = await validateCouponForCart({
      storeId: shop.id,
      code: "OLD",
      lines: [{ productId: p1.id, lineTotalKobo: 1_000_000 }],
    });
    expect(expired.ok).toBe(false);

    await createCoupon(user.id, {
      storeId: shop.id,
      code: "SOON",
      type: "percentage",
      value: 10,
      startsAt: new Date(Date.now() + 3600_000),
    });
    const future = await validateCouponForCart({
      storeId: shop.id,
      code: "SOON",
      lines: [{ productId: p1.id, lineTotalKobo: 1_000_000 }],
    });
    expect(future.ok).toBe(false);
  });
});

describe("coupon validation hardening", () => {
  it("rejects invalid percentage and fixed values on create", async () => {
    const { user, shop } = await seed();
    await expect(
      createCoupon(user.id, {
        storeId: shop.id,
        code: "BADPCT",
        type: "percentage",
        value: 150,
      })
    ).rejects.toThrow(/percentage/i);
    await expect(
      createCoupon(user.id, {
        storeId: shop.id,
        code: "BADPCT0",
        type: "percentage",
        value: 0,
      })
    ).rejects.toThrow();
    await expect(
      createCoupon(user.id, {
        storeId: shop.id,
        code: "BADFIX",
        type: "fixed",
        value: 0,
      })
    ).rejects.toThrow();
  });

  it("rejects expiresAt <= startsAt", async () => {
    const { user, shop } = await seed();
    const start = new Date("2026-06-01T10:00:00Z");
    const same = new Date("2026-06-01T10:00:00Z");
    const before = new Date("2026-05-01T10:00:00Z");
    await expect(
      createCoupon(user.id, {
        storeId: shop.id,
        code: "DATE1",
        type: "percentage",
        value: 10,
        startsAt: start,
        expiresAt: same,
      })
    ).rejects.toThrow(/expir/i);
    await expect(
      createCoupon(user.id, {
        storeId: shop.id,
        code: "DATE2",
        type: "percentage",
        value: 10,
        startsAt: start,
        expiresAt: before,
      })
    ).rejects.toThrow(/expir/i);
  });

  it("PATCH validates final percentage when type changes without value", async () => {
    const { user, shop } = await seed();
    const c = await createCoupon(user.id, {
      storeId: shop.id,
      code: "FIX2PCT",
      type: "fixed",
      value: 2000, // ₦2000 → 200000 kobo stored
    });
    // Changing to percentage without new value must validate stored kobo as %
    await expect(
      updateCoupon(user.id, c.id, { type: "percentage" })
    ).rejects.toThrow(/percentage/i);
  });

  it("PATCH updates fields and product restrictions", async () => {
    const { user, shop, p1, p2 } = await seed();
    const c = await createCoupon(user.id, {
      storeId: shop.id,
      code: "EDITME",
      type: "percentage",
      value: 10,
      productIds: [p1.id],
    });
    const updated = await updateCoupon(user.id, c.id, {
      code: "EDITED",
      value: 15,
      productIds: [p2.id],
      active: true,
    });
    expect(updated.code).toBe("EDITED");
    expect(updated.value).toBe(15);
    expect(updated.productIds).toEqual([p2.id]);
  });

  it("rejects invalid product IDs on update", async () => {
    const { user, shop, p1 } = await seed();
    const c = await createCoupon(user.id, {
      storeId: shop.id,
      code: "PRODS",
      type: "percentage",
      value: 10,
    });
    await expect(
      updateCoupon(user.id, c.id, { productIds: [p1.id, 999999] })
    ).rejects.toThrow(/product/i);
  });

  it("rejects invalid usage limits on update", async () => {
    const { user, shop } = await seed();
    const c = await createCoupon(user.id, {
      storeId: shop.id,
      code: "ULIM",
      type: "percentage",
      value: 10,
    });
    await expect(
      updateCoupon(user.id, c.id, { usageLimit: 0 })
    ).rejects.toThrow(/usage limit/i);
    await expect(
      updateCoupon(user.id, c.id, { perCustomerLimit: -1 })
    ).rejects.toThrow(/per-customer/i);
  });

  it("maximum discount cap is enforced on validate", async () => {
    const { user, shop, p1 } = await seed();
    await createCoupon(user.id, {
      storeId: shop.id,
      code: "CAP",
      type: "percentage",
      value: 50,
      maximumDiscountAmountNgn: 1000, // ₦1,000 cap
    });
    const v = await validateCouponForCart({
      storeId: shop.id,
      code: "CAP",
      lines: [{ productId: p1.id, lineTotalKobo: 1_000_000 }],
    });
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.discountKobo).toBe(100_000); // capped at ₦1000
    }
  });

  it("per-customer limit is enforced", async () => {
    const { user, shop, p1 } = await seed();
    await createCoupon(user.id, {
      storeId: shop.id,
      code: "ONCEPERSON",
      type: "percentage",
      value: 5,
      perCustomerLimit: 1,
    });
    await createPendingOrder({
      storeId: shop.id,
      customerName: "A",
      customerPhone: "080",
      customerEmail: "same@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: p1.id, quantity: 1 }],
      paymentReference: `ref_pc_${Math.random().toString(16).slice(2)}`,
      couponCode: "ONCEPERSON",
    });
    await expect(
      createPendingOrder({
        storeId: shop.id,
        customerName: "A",
        customerPhone: "080",
        customerEmail: "same@ex.com",
        deliveryAddress: "Lagos",
        items: [{ productId: p1.id, quantity: 1 }],
        paymentReference: `ref_pc2_${Math.random().toString(16).slice(2)}`,
        couponCode: "ONCEPERSON",
      })
    ).rejects.toThrow(/per-customer|limit/i);
  });

  it("concurrent usage cannot exceed limit", async () => {
    const { user, shop, p1 } = await seed();
    await createCoupon(user.id, {
      storeId: shop.id,
      code: "LASTSLOT",
      type: "percentage",
      value: 5,
      usageLimit: 1,
    });
    const results = await Promise.allSettled([
      createPendingOrder({
        storeId: shop.id,
        customerName: "A",
        customerPhone: "080",
        customerEmail: "a@ex.com",
        deliveryAddress: "Lagos",
        items: [{ productId: p1.id, quantity: 1 }],
        paymentReference: `ref_race_a_${Math.random().toString(16).slice(2)}`,
        couponCode: "LASTSLOT",
      }),
      createPendingOrder({
        storeId: shop.id,
        customerName: "B",
        customerPhone: "081",
        customerEmail: "b@ex.com",
        deliveryAddress: "Abuja",
        items: [{ productId: p1.id, quantity: 1 }],
        paymentReference: `ref_race_b_${Math.random().toString(16).slice(2)}`,
        couponCode: "LASTSLOT",
      }),
    ]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
  });
});

describe("coupon form helpers (selection edit)", () => {
  it("editing product restrictions replaces the set", async () => {
    const { user, shop, p1, p2 } = await seed();
    const c = await createCoupon(user.id, {
      storeId: shop.id,
      code: "SWAP",
      type: "percentage",
      value: 10,
      productIds: [p1.id],
    });
    const updated = await updateCoupon(user.id, c.id, {
      productIds: [p2.id],
    });
    expect(updated.productIds).toEqual([p2.id]);
    expect(updated.productIds).not.toContain(p1.id);
  });
});
