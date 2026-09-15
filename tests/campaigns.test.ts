import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMemoryStore, memSignup, memCreateStore, memCreateProduct, getMemoryStore } from "@/lib/server/memory-repo";
import {
  createCampaign, updateCampaign, deleteCampaign, listCampaignsForOwner,
  listPublicCampaignsForStore, getPublicCampaignBySlugs, isCampaignPubliclyVisible,
} from "@/lib/server/campaigns";
import { createCoupon } from "@/lib/server/coupons";
import { canTransition as statusCanTransition } from "@/lib/campaigns/types";
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
  const user = await memSignup({ email: `mkt-${Math.random().toString(16).slice(2)}@ex.com`, password: "password12", fullName: "Seller" });
  const other = await memSignup({ email: `mkt-o-${Math.random().toString(16).slice(2)}@ex.com`, password: "password12", fullName: "Other" });
  const shop = memCreateStore({ ownerId: user.id, name: `Market Shop ${Math.random().toString(16).slice(2, 8)}` });
  const otherShop = memCreateStore({ ownerId: other.id, name: `Other Shop ${Math.random().toString(16).slice(2, 8)}` });
  await grantPro(user.id, shop.id, user.email);
  await grantPro(other.id, otherShop.id, other.email);
  memCreateProduct({ ownerId: user.id, storeId: shop.id, name: "Promo Item", priceKobo: 500_000, stock: 10 });
  return { user, other, shop, otherShop };
}

describe("campaign status transitions", () => {
  it("allows draft → active and rejects expired → active", () => {
    expect(statusCanTransition("draft", "active")).toBe(true);
    expect(statusCanTransition("expired", "active")).toBe(false);
  });
});

describe("campaign ownership", () => {
  it("creates campaign for owned store only", async () => {
    const { user, other, shop, otherShop } = await seed();
    const c = await createCampaign(user.id, { storeId: shop.id, name: "Launch Sale", campaignType: "seasonal_sale", status: "draft" });
    expect(c.storeId).toBe(shop.id);
    await expect(createCampaign(other.id, { storeId: shop.id, name: "Hijack", campaignType: "announcement" })).rejects.toThrow(/Store not found/);
    await expect(createCampaign(user.id, { storeId: otherShop.id, name: "Cross", campaignType: "announcement" })).rejects.toThrow(/Store not found/);
  });
});

describe("public visibility", () => {
  it("hides drafts and expired", async () => {
    const { user, shop } = await seed();
    const draft = await createCampaign(user.id, { storeId: shop.id, name: "Draft", campaignType: "announcement", status: "draft" });
    expect(isCampaignPubliclyVisible(draft)).toBe(false);
    const active = await createCampaign(user.id, { storeId: shop.id, name: "Live", campaignType: "announcement", status: "active" });
    expect(isCampaignPubliclyVisible(active)).toBe(true);
    const list = await listPublicCampaignsForStore(shop.id);
    expect(list.some((c) => c.slug === active.slug)).toBe(true);
    expect(list.some((c) => c.slug === draft.slug)).toBe(false);
  });
  it("shows expired landing state", async () => {
    const { user, shop } = await seed();
    const ended = await createCampaign(user.id, { storeId: shop.id, name: "Was Live", campaignType: "announcement", status: "active", endsAt: new Date(Date.now() - 5000).toISOString() });
    const page = await getPublicCampaignBySlugs(shop.slug, ended.slug);
    expect(page!.expired).toBe(true);
  });
});

describe("lifecycle", () => {
  it("enforces transitions and draft-only delete", async () => {
    const { user, shop } = await seed();
    const c = await createCampaign(user.id, { storeId: shop.id, name: "Lifecycle", campaignType: "announcement", status: "draft" });
    await updateCampaign(user.id, c.id, { status: "active" });
    await expect(updateCampaign(user.id, c.id, { status: "draft" })).rejects.toThrow(/Cannot change/);
    await expect(deleteCampaign(user.id, c.id)).rejects.toThrow(/Only draft/);
    const d = await createCampaign(user.id, { storeId: shop.id, name: "Del", campaignType: "announcement", status: "draft" });
    await deleteCampaign(user.id, d.id);
    expect((await listCampaignsForOwner(user.id, shop.id)).some((x) => x.id === d.id)).toBe(false);
  });
});

describe("coupon association", () => {
  it("rejects foreign coupons", async () => {
    const { user, other, shop, otherShop } = await seed();
    const mine = await createCoupon(user.id, { storeId: shop.id, code: "SAVE10", type: "percentage", value: 10, active: true });
    const theirs = await createCoupon(other.id, { storeId: otherShop.id, code: "THEIRS", type: "percentage", value: 20, active: true });
    await expect(createCampaign(user.id, { storeId: shop.id, name: "Steal", campaignType: "coupon_promotion", status: "active", couponId: theirs.id })).rejects.toThrow(/Coupon not found/);
    const camp = await createCampaign(user.id, { storeId: shop.id, name: "With", campaignType: "coupon_promotion", status: "active", couponId: mine.id });
    const found = (await listPublicCampaignsForStore(shop.id)).find((c) => c.id === camp.id);
    expect(found?.couponCode).toBe("SAVE10");
  });
});

describe("events", () => {
  it("can record campaign_view", async () => {
    const { shop } = await seed();
    const ms = getMemoryStore();
    ms.storeEvents.push({ id: ms.seq.storeEvent++, storeId: shop.id, productId: null, eventType: "campaign_view", visitorId: "v1", metadata: "{}", createdAt: new Date() });
    expect(ms.storeEvents.filter((e) => e.eventType === "campaign_view")).toHaveLength(1);
  });
});
