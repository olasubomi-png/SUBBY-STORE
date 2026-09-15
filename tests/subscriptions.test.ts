import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMemoryStore, memSignup, memCreateStore } from "@/lib/server/memory-repo";
import { createProduct } from "@/lib/server/repo";
import {
  seedMemoryPlans, listActivePlans, ensureStoreSubscription, startSubscriptionCheckout,
  confirmSubscriptionPayment, confirmRenewalPayment, markSubscriptionPastDue,
  cancelSubscription, resumeSubscription, getEffectivePlanForStore, computeEffectiveStatus,
  getStoreSubscription, markSubscriptionNonRenewing, markSubscriptionDisabledByProvider,
  GRACE_DAYS,
} from "@/lib/server/subscriptions";
import { canCreateProduct, canUseCampaigns } from "@/lib/server/entitlements";
import { verifyPaystackWebhookSignature } from "@/lib/server/paystack";

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
  const user = await memSignup({
    email: `sub-${Math.random().toString(16).slice(2)}@ex.com`,
    password: "password12",
    fullName: "Seller",
  });
  const shop = memCreateStore({
    ownerId: user.id,
    name: `Shop ${Math.random().toString(16).slice(2, 8)}`,
  });
  return { user, shop };
}


async function forcePeriodNearEnd(shopId: number, hoursAgo = 1) {
  const { getMemoryStore } = await import("@/lib/server/memory-repo");
  const ms = getMemoryStore();
  const sub = await getStoreSubscription(shopId);
  const idx = ms.subscriptions.findIndex((s) => s.id === sub!.id);
  ms.subscriptions[idx] = {
    ...ms.subscriptions[idx]!,
    currentPeriodEnd: new Date(Date.now() - hoursAgo * 3600000),
  };
}

async function activatePro(user: { id: number; email: string }, shopId: number) {
  await ensureStoreSubscription(shopId);
  const checkout = await startSubscriptionCheckout({
    ownerId: user.id, storeId: shopId, planSlug: "pro", email: user.email,
  });
  if (checkout.kind !== "checkout") throw new Error("expected checkout");
  await confirmSubscriptionPayment({
    reference: checkout.reference,
    amountKobo: checkout.amountKobo,
    rawEventId: `evt_${checkout.reference}`,
    authorizationCode: `AUTH_${checkout.reference}`,
    customerCode: `CUS_${shopId}`,
    subscriptionCode: `SUB_${shopId}`,
    nextPaymentDate: new Date(Date.now() + 30 * 86400000).toISOString(),
  });
  return checkout;
}

describe("plans", () => {
  it("lists free pro business with provider plan codes in mock", async () => {
    const plans = await listActivePlans();
    expect(plans.map((p) => p.slug).sort()).toEqual(["business", "free", "pro"]);
    const pro = plans.find((p) => p.slug === "pro")!;
    expect(pro.priceKobo).toBe(500_000);
    expect(pro.providerPlanCode).toBeTruthy();
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

describe("checkout and provider identifiers", () => {
  it("activates pro and stores Paystack codes", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("pro");
    expect((await canUseCampaigns(shop.id)).allowed).toBe(true);
    const sub = await getStoreSubscription(shop.id);
    expect(sub?.providerSubscriptionCode).toMatch(/^SUB_/);
    expect(sub?.providerCustomerCode).toMatch(/^CUS_/);
    expect(sub?.providerAuthorizationCode).toMatch(/^AUTH_/);
    expect(sub?.status).toBe("active");
  });

  it("is idempotent on rawEventId", async () => {
    const { user, shop } = await seedSeller();
    await ensureStoreSubscription(shop.id);
    const checkout = await startSubscriptionCheckout({
      ownerId: user.id, storeId: shop.id, planSlug: "pro", email: user.email,
    });
    if (checkout.kind !== "checkout") throw new Error("expected checkout");
    const first = await confirmSubscriptionPayment({
      reference: checkout.reference, amountKobo: checkout.amountKobo, rawEventId: "evt_same",
      subscriptionCode: "SUB_x", customerCode: "CUS_x", authorizationCode: "AUTH_x",
    });
    expect(first.alreadyProcessed).toBe(false);
    const second = await confirmSubscriptionPayment({
      reference: checkout.reference, amountKobo: checkout.amountKobo, rawEventId: "evt_same",
    });
    expect(second.alreadyProcessed).toBe(true);
  });

  it("rejects amount mismatch and cross-owner", async () => {
    const a = await seedSeller();
    const b = await seedSeller();
    await ensureStoreSubscription(a.shop.id);
    const checkout = await startSubscriptionCheckout({
      ownerId: a.user.id, storeId: a.shop.id, planSlug: "pro", email: a.user.email,
    });
    if (checkout.kind !== "checkout") throw new Error("expected checkout");
    await expect(
      confirmSubscriptionPayment({ reference: checkout.reference, amountKobo: 1 })
    ).rejects.toThrow(/amount_mismatch/);
    await expect(
      startSubscriptionCheckout({
        ownerId: b.user.id, storeId: a.shop.id, planSlug: "pro", email: b.user.email,
      })
    ).rejects.toThrow(/Store not found/);
  });
});

describe("renewal", () => {
  it("extends period on successful renewal and is idempotent", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    const subBefore = await getStoreSubscription(shop.id);
    const endBefore = subBefore!.currentPeriodEnd!.getTime();
    const next = new Date(endBefore + 30 * 86400000).toISOString();
    const first = await confirmRenewalPayment({
      reference: `ren_${shop.id}_1`,
      amountKobo: 500_000,
      rawEventId: "evt_ren_1",
      subscriptionCode: `SUB_${shop.id}`,
      customerCode: `CUS_${shop.id}`,
      nextPaymentDate: next,
    });
    expect(first.alreadyProcessed).toBe(false);
    expect(first.subscription.status).toBe("active");
    expect(first.subscription.currentPeriodEnd!.getTime()).toBeGreaterThanOrEqual(endBefore);
    const second = await confirmRenewalPayment({
      reference: `ren_${shop.id}_1`,
      amountKobo: 500_000,
      rawEventId: "evt_ren_1",
      subscriptionCode: `SUB_${shop.id}`,
    });
    expect(second.alreadyProcessed).toBe(true);
  });

  it("marks past_due on failed renewal", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    await forcePeriodNearEnd(shop.id);
    const result = await markSubscriptionPastDue({
      subscriptionCode: `SUB_${shop.id}`,
      rawEventId: "evt_fail_1",
    });
    expect(result?.status).toBe("past_due");
    // still entitled during grace
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("pro");
  });
});

describe("cancel and resume", () => {
  it("cancel at period end keeps benefits; resume clears flag", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    const canceled = await cancelSubscription({
      ownerId: user.id, storeId: shop.id, immediate: false,
    });
    expect(canceled.subscription.cancelAtPeriodEnd).toBe(true);
    expect(canceled.localUpdated).toBe(true);
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("pro");
    const resumed = await resumeSubscription({ ownerId: user.id, storeId: shop.id });
    expect(resumed.subscription.cancelAtPeriodEnd).toBe(false);
  });

  it("immediate cancel switches to free without deleting products", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    for (let i = 0; i < 5; i++) {
      await createProduct({ ownerId: user.id, storeId: shop.id, name: `Keep${i}`, priceKobo: 100_000, stock: 1 });
    }
    await cancelSubscription({ ownerId: user.id, storeId: shop.id, immediate: true });
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("free");
  });
});

describe("grace period", () => {
  it("past_due then expired after grace", () => {
    const now = new Date();
    const ended = new Date(now.getTime() - 86400000);
    const sub = {
      id: 1, storeId: 1, planId: 2, status: "active" as string, provider: "paystack",
      providerSubscriptionCode: "SUB_x", providerCustomerCode: null,
      providerAuthorizationCode: null, providerEmailToken: null,
      currentPeriodStart: ended, currentPeriodEnd: ended, cancelAtPeriodEnd: false, canceledAt: null,
      createdAt: now, updatedAt: now,
    };
    expect(computeEffectiveStatus(sub, now)).toBe("past_due");
    expect(computeEffectiveStatus(sub, new Date(ended.getTime() + (GRACE_DAYS + 1) * 86400000))).toBe("expired");
  });
});


describe("provider not_renew", () => {
  it("sets cancelAtPeriodEnd without past_due or grace", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    const first = await markSubscriptionNonRenewing({
      subscriptionCode: `SUB_${shop.id}`,
      rawEventId: "evt_not_renew_1",
    });
    expect(first?.status).not.toBe("past_due");
    expect(first?.cancelAtPeriodEnd).toBe(true);
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("pro");

    const second = await markSubscriptionNonRenewing({
      subscriptionCode: `SUB_${shop.id}`,
      rawEventId: "evt_not_renew_1",
    });
    expect(second?.cancelAtPeriodEnd).toBe(true);
    expect(second?.status).not.toBe("past_due");
  });
});

describe("provider disable", () => {
  it("before period end: non-renewing, not past_due, paid plan kept", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    const first = await markSubscriptionDisabledByProvider({
      subscriptionCode: `SUB_${shop.id}`,
      rawEventId: "evt_disable_1",
    });
    expect(first?.status).not.toBe("past_due");
    expect(first?.cancelAtPeriodEnd).toBe(true);
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("pro");

    const second = await markSubscriptionDisabledByProvider({
      subscriptionCode: `SUB_${shop.id}`,
      rawEventId: "evt_disable_1",
    });
    expect(second?.cancelAtPeriodEnd).toBe(true);
  });

  it("after period end: Free fallback, products untouched", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    for (let i = 0; i < 3; i++) {
      await createProduct({
        ownerId: user.id, storeId: shop.id, name: `KeepD${i}`, priceKobo: 100_000, stock: 1,
      });
    }
    // Force period already ended
    const sub = await getStoreSubscription(shop.id);
    const { getMemoryStore } = await import("@/lib/server/memory-repo");
    const ms = getMemoryStore();
    const idx = ms.subscriptions.findIndex((s) => s.id === sub!.id);
    ms.subscriptions[idx] = {
      ...ms.subscriptions[idx]!,
      currentPeriodEnd: new Date(Date.now() - 86400000),
    };

    const result = await markSubscriptionDisabledByProvider({
      subscriptionCode: `SUB_${shop.id}`,
      rawEventId: "evt_disable_ended",
    });
    expect(result?.status).toBe("canceled");
    expect(result?.status).not.toBe("past_due");
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("free");
  });
});

describe("failed payment stays past_due with grace", () => {
  it("duplicate failed event is idempotent", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    await forcePeriodNearEnd(shop.id);
    const a = await markSubscriptionPastDue({
      subscriptionCode: `SUB_${shop.id}`,
      rawEventId: "evt_fail_dup",
    });
    expect(a?.status).toBe("past_due");
    const b = await markSubscriptionPastDue({
      subscriptionCode: `SUB_${shop.id}`,
      rawEventId: "evt_fail_dup",
    });
    expect(b?.status).toBe("past_due");
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("pro");
  });
});


describe("past_due recovery and stale failure", () => {
  it("renewal restores past_due to active", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    await forcePeriodNearEnd(shop.id);
    await markSubscriptionPastDue({
      subscriptionCode: `SUB_${shop.id}`,
      rawEventId: "evt_fail_then_ok",
    });
    expect((await getStoreSubscription(shop.id))?.status).toBe("past_due");
    const next = new Date(Date.now() + 30 * 86400000).toISOString();
    const ren = await confirmRenewalPayment({
      reference: `ren_recover_${shop.id}`,
      amountKobo: 500_000,
      rawEventId: "evt_ren_recover",
      subscriptionCode: `SUB_${shop.id}`,
      customerCode: `CUS_${shop.id}`,
      nextPaymentDate: next,
    });
    expect(ren.subscription.status).toBe("active");
    expect((await getEffectivePlanForStore(shop.id)).slug).toBe("pro");
  });

  it("ignores delayed payment_failed after successful long period renewal", async () => {
    const { user, shop } = await seedSeller();
    await activatePro(user, shop.id);
    // Period far in the future
    const { getMemoryStore } = await import("@/lib/server/memory-repo");
    const ms = getMemoryStore();
    const sub = await getStoreSubscription(shop.id);
    const idx = ms.subscriptions.findIndex((s) => s.id === sub!.id);
    ms.subscriptions[idx] = {
      ...ms.subscriptions[idx]!,
      status: "active",
      currentPeriodEnd: new Date(Date.now() + 20 * 86400000),
    };
    const result = await markSubscriptionPastDue({
      subscriptionCode: `SUB_${shop.id}`,
      rawEventId: "evt_stale_fail",
    });
    expect(result?.status).toBe("active");
    expect(result?.status).not.toBe("past_due");
  });
});

describe("webhook signature", () => {
  it("accepts mock-valid-signature in mock mode", () => {
    expect(verifyPaystackWebhookSignature("{}", "mock-valid-signature")).toBe(true);
    expect(verifyPaystackWebhookSignature("{}", "bad")).toBe(false);
  });
});
