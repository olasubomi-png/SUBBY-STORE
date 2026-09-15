import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMemoryStore, memSignup, memCreateStore } from "@/lib/server/memory-repo";
import { createProduct } from "@/lib/server/repo";
import {
  seedMemoryPlans, listActivePlans, ensureStoreSubscription, startSubscriptionCheckout,
  confirmSubscriptionPayment, cancelSubscription, getEffectivePlanForStore, computeEffectiveStatus, GRACE_DAYS,
} from "@/lib/server/subscriptions";
import { canCreateProduct, canUseCampaigns } from "@/lib/server/entitlements";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  process.env.PAYSTACK_MODE = "mock";
  process.env.SESSION_SECRET = "dev_session_secret_at_least_32_chars_long";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  seedMemoryPlans();
});
afterEach(() => resetMemoryStore());

async function seedSeller() {
  const user = await memSignup({ email: `sub-${Math.random().toString(16).slice(2)}@ex.com`, password: "password12", fullName: "Seller" });
  const shop = memCreateStore({ ownerId: user.id, name: `Shop ${Math.random().toString(16).slice(2, 8)}` });
  return { user, shop };
}

describe("plans", () => {
  it("lists free pro business", async () => {
    const plans = await listActivePlans();
    expect(plans.map((p) => p.slug).sort()).toEqual(["business", "free", "pro"]);
  });
});

describe("limits", () => {
  it("blocks 11th product on free", async () => {
    const { user, shop } = await seedSeller();
    await ensureStoreSubscription(shop.id);
    for (let i = 0; i < 10; i++) {
      await createProduct({ ownerId: user.id, storeId: shop.id, name: `P${i}`, priceKobo: 100_000, stock: 1 });
    }
    expect((await canCreateProduct(shop.id)).allowed).toBe(false);
  });
});

describe("checkout", () => {
  it("activates pro and is idempotent", async () => {
    const { user, shop } = await seedSeller();
    await ensureStoreSubscription(shop.id);
    expect((await canUseCampaigns(shop.id)).allowed).toBe(false);
    const checkout = await startSubscriptionCheckout({ ownerId: user.id, storeId: shop.id, planSlug: "pro", email: user.email });
    if (checkout.kind !== "checkout") throw new Error("expected checkout");
    const first = await confirmSubscriptionPayment({ reference: checkout.reference, amountKobo: checkout.amountKobo, rawEventId: "evt1" });
    expect(first.alreadyProcessed).toBe(false);
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("pro");
    const second = await confirmSubscriptionPayment({ reference: checkout.reference, amountKobo: checkout.amountKobo, rawEventId: "evt1" });
    expect(second.alreadyProcessed).toBe(true);
  });

  it("rejects cross-owner", async () => {
    const a = await seedSeller();
    const b = await seedSeller();
    await ensureStoreSubscription(a.shop.id);
    await expect(
      startSubscriptionCheckout({ ownerId: b.user.id, storeId: a.shop.id, planSlug: "pro", email: b.user.email })
    ).rejects.toThrow(/Store not found/);
  });
});

describe("cancel", () => {
  it("immediate cancel to free", async () => {
    const { user, shop } = await seedSeller();
    await ensureStoreSubscription(shop.id);
    const checkout = await startSubscriptionCheckout({ ownerId: user.id, storeId: shop.id, planSlug: "pro", email: user.email });
    if (checkout.kind !== "checkout") throw new Error("expected checkout");
    await confirmSubscriptionPayment({ reference: checkout.reference, amountKobo: checkout.amountKobo, rawEventId: "evt2" });
    await cancelSubscription({ ownerId: user.id, storeId: shop.id, immediate: true });
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("free");
  });
});

describe("grace", () => {
  it("past_due then expired", () => {
    const now = new Date();
    const ended = new Date(now.getTime() - 86400000);
    const sub = {
      id: 1, storeId: 1, planId: 2, status: "active", provider: "paystack",
      providerSubscriptionCode: null, providerCustomerCode: null,
      currentPeriodStart: ended, currentPeriodEnd: ended, cancelAtPeriodEnd: false, canceledAt: null,
      createdAt: now, updatedAt: now,
    };
    expect(computeEffectiveStatus(sub, now)).toBe("past_due");
    expect(computeEffectiveStatus(sub, new Date(ended.getTime() + (GRACE_DAYS + 1) * 86400000))).toBe("expired");
  });
});
