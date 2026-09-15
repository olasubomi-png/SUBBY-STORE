/**
 * Seller subscription & billing core.
 * DB is source of truth; charges use existing Paystack transaction flow.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  billingTransactions, subscriptionEvents, subscriptionPlans, subscriptions, stores,
} from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import { initializePaystackTransaction, verifyPaystackTransaction, appUrl } from "@/lib/server/paystack";
import { assertNonNegativeKobo, assertPositiveKobo } from "@/lib/money";

export type PlanFeatures = {
  campaigns: boolean; coupons: boolean; advancedAnalytics: boolean;
  advancedCustomers: boolean; advancedMarketing: boolean; fullCustomization: boolean;
};
export type SubscriptionPlanRow = {
  id: number; name: string; slug: string; description: string; priceKobo: number;
  billingInterval: string; productLimit: number | null; featuresJson: string;
  features: PlanFeatures; active: boolean; sortOrder: number;
};
export type SubscriptionRow = {
  id: number; storeId: number; planId: number; status: string; provider: string;
  providerSubscriptionCode: string | null; providerCustomerCode: string | null;
  currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean; canceledAt: Date | null; createdAt: Date; updatedAt: Date;
};

export const GRACE_DAYS = 3;
export const PERIOD_DAYS = 30;

const DEFAULT_FEATURES: PlanFeatures = {
  campaigns: false, coupons: false, advancedAnalytics: false,
  advancedCustomers: false, advancedMarketing: false, fullCustomization: true,
};

export function parseFeatures(json: string): PlanFeatures {
  try {
    const o = JSON.parse(json || "{}") as Partial<PlanFeatures>;
    return {
      campaigns: Boolean(o.campaigns), coupons: Boolean(o.coupons),
      advancedAnalytics: Boolean(o.advancedAnalytics), advancedCustomers: Boolean(o.advancedCustomers),
      advancedMarketing: Boolean(o.advancedMarketing),
      fullCustomization: o.fullCustomization === undefined ? true : Boolean(o.fullCustomization),
    };
  } catch { return { ...DEFAULT_FEATURES }; }
}

function withFeatures(row: Omit<SubscriptionPlanRow, "features">): SubscriptionPlanRow {
  return { ...row, features: parseFeatures(row.featuresJson) };
}

const SEED_PLANS = [
  { name: "Free", slug: "free", description: "Get started with a basic online store.", priceKobo: 0, productLimit: 10 as number | null,
    features: { campaigns: false, coupons: false, advancedAnalytics: false, advancedCustomers: false, advancedMarketing: false, fullCustomization: true }, sortOrder: 0 },
  { name: "Pro", slug: "pro", description: "Grow with campaigns, coupons, and higher limits.", priceKobo: 500_000, productLimit: 100 as number | null,
    features: { campaigns: true, coupons: true, advancedAnalytics: true, advancedCustomers: true, advancedMarketing: true, fullCustomization: true }, sortOrder: 1 },
  { name: "Business", slug: "business", description: "Unlimited products and full marketing suite.", priceKobo: 1_500_000, productLimit: null as number | null,
    features: { campaigns: true, coupons: true, advancedAnalytics: true, advancedCustomers: true, advancedMarketing: true, fullCustomization: true }, sortOrder: 2 },
];

export function seedMemoryPlans(): void {
  const ms = mem.getMemoryStore();
  if (ms.subscriptionPlans.length > 0) return;
  for (const p of SEED_PLANS) {
    ms.subscriptionPlans.push({
      id: ms.seq.subscriptionPlan++, name: p.name, slug: p.slug, description: p.description,
      priceKobo: p.priceKobo, billingInterval: "monthly", productLimit: p.productLimit,
      featuresJson: JSON.stringify(p.features), active: true, sortOrder: p.sortOrder,
      createdAt: new Date(), updatedAt: new Date(),
    });
  }
}

export async function listActivePlans(): Promise<SubscriptionPlanRow[]> {
  if (useMemory()) {
    seedMemoryPlans();
    return mem.getMemoryStore().subscriptionPlans.filter((p) => p.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => withFeatures({ ...p }));
  }
  const rows = await getDb().select().from(subscriptionPlans).where(eq(subscriptionPlans.active, true));
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map((p) => withFeatures({
    id: p.id, name: p.name, slug: p.slug, description: p.description, priceKobo: p.priceKobo,
    billingInterval: p.billingInterval, productLimit: p.productLimit, featuresJson: p.featuresJson,
    active: p.active, sortOrder: p.sortOrder,
  }));
}

export async function getPlanBySlug(slug: string) {
  return (await listActivePlans()).find((p) => p.slug === slug) ?? null;
}

export async function getPlanById(id: number) {
  if (useMemory()) {
    seedMemoryPlans();
    const p = mem.getMemoryStore().subscriptionPlans.find((x) => x.id === id);
    return p ? withFeatures({ ...p }) : null;
  }
  const rows = await getDb().select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
  const p = rows[0];
  if (!p) return null;
  return withFeatures({
    id: p.id, name: p.name, slug: p.slug, description: p.description, priceKobo: p.priceKobo,
    billingInterval: p.billingInterval, productLimit: p.productLimit, featuresJson: p.featuresJson,
    active: p.active, sortOrder: p.sortOrder,
  });
}

async function getFreePlan() {
  const free = await getPlanBySlug("free");
  if (!free) throw new Error("Free plan is not configured");
  return free;
}

export async function getStoreSubscription(storeId: number): Promise<SubscriptionRow | null> {
  if (useMemory()) return mem.getMemoryStore().subscriptions.find((s) => s.storeId === storeId) ?? null;
  const rows = await getDb().select().from(subscriptions).where(eq(subscriptions.storeId, storeId)).limit(1);
  return rows[0] ?? null;
}

export async function ensureStoreSubscription(storeId: number): Promise<SubscriptionRow> {
  const existing = await getStoreSubscription(storeId);
  if (existing) return refreshSubscriptionStatus(existing);
  const free = await getFreePlan();
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const row: SubscriptionRow = {
      id: ms.seq.subscription++, storeId, planId: free.id, status: "active", provider: "none",
      providerSubscriptionCode: null, providerCustomerCode: null, currentPeriodStart: new Date(),
      currentPeriodEnd: null, cancelAtPeriodEnd: false, canceledAt: null, createdAt: new Date(), updatedAt: new Date(),
    };
    ms.subscriptions.push(row);
    return row;
  }
  const inserted = await getDb().insert(subscriptions).values({
    storeId, planId: free.id, status: "active", provider: "none", currentPeriodStart: new Date(),
  }).returning();
  return inserted[0]!;
}

export function computeEffectiveStatus(sub: SubscriptionRow, now = new Date()): string {
  if (sub.status === "canceled" || sub.status === "expired") {
    if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() > now.getTime()) return "active";
    return sub.status === "canceled" ? "canceled" : "expired";
  }
  if (sub.status === "incomplete") return "incomplete";
  if (sub.status === "past_due") {
    if (sub.currentPeriodEnd) {
      const graceEnd = sub.currentPeriodEnd.getTime() + GRACE_DAYS * 86400000;
      if (now.getTime() > graceEnd) return "expired";
    }
    return "past_due";
  }
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < now.getTime()) {
    const graceEnd = sub.currentPeriodEnd.getTime() + GRACE_DAYS * 86400000;
    if (now.getTime() > graceEnd) return "expired";
    return "past_due";
  }
  return "active";
}

async function refreshSubscriptionStatus(sub: SubscriptionRow): Promise<SubscriptionRow> {
  const effective = computeEffectiveStatus(sub);
  if (effective === sub.status) return sub;
  const free = await getFreePlan();
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const idx = ms.subscriptions.findIndex((s) => s.id === sub.id);
    if (idx >= 0) {
      const next = {
        ...ms.subscriptions[idx]!,
        status: effective === "expired" ? "expired" : effective,
        planId: effective === "expired" || effective === "canceled" ? free.id : ms.subscriptions[idx]!.planId,
        updatedAt: new Date(),
      };
      ms.subscriptions[idx] = next;
      return next;
    }
    return sub;
  }
  const updated = await getDb().update(subscriptions).set({
    status: effective === "expired" ? "expired" : effective,
    updatedAt: new Date(),
    ...(effective === "expired" ? { planId: free.id } : {}),
  }).where(eq(subscriptions.id, sub.id)).returning();
  return updated[0] ?? sub;
}

export async function getEffectivePlanForStore(storeId: number): Promise<SubscriptionPlanRow> {
  const sub = await ensureStoreSubscription(storeId);
  const status = computeEffectiveStatus(sub);
  if (status === "active" || status === "past_due") {
    const plan = await getPlanById(sub.planId);
    if (plan) return plan;
  }
  return getFreePlan();
}

async function recordEvent(subscriptionId: number, eventType: string, providerEventId: string | null, metadata?: Record<string, unknown>) {
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    if (providerEventId && ms.subscriptionEvents.some((e) => e.providerEventId === providerEventId)) return;
    ms.subscriptionEvents.push({
      id: ms.seq.subscriptionEvent++, subscriptionId, eventType, providerEventId,
      metadata: metadata ? JSON.stringify(metadata) : null, processedAt: new Date(), createdAt: new Date(),
    });
    return;
  }
  try {
    await getDb().insert(subscriptionEvents).values({
      subscriptionId, eventType, providerEventId, metadata: metadata ? JSON.stringify(metadata) : null,
    });
  } catch { /* unique — idempotent */ }
}

function addDays(d: Date, days: number) { return new Date(d.getTime() + days * 86400000); }
function makeReference(storeId: number, planSlug: string) {
  return `sub_${storeId}_${planSlug}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`;
}

async function assertStoreOwned(storeId: number, ownerId: number) {
  if (useMemory()) {
    const s = mem.getMemoryStore().stores.find((x) => x.id === storeId);
    if (!s || s.ownerId !== ownerId) throw new Error("Store not found");
    return;
  }
  const rows = await getDb().select().from(stores).where(and(eq(stores.id, storeId), eq(stores.ownerId, ownerId))).limit(1);
  if (!rows[0]) throw new Error("Store not found");
}

async function applyPlanToSubscription(sub: SubscriptionRow, plan: SubscriptionPlanRow, opts: {
  status: string; periodStart: Date | null; periodEnd: Date | null; provider: string;
}): Promise<SubscriptionRow> {
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const idx = ms.subscriptions.findIndex((s) => s.id === sub.id);
    if (idx < 0) throw new Error("Subscription not found");
    const next = {
      ...ms.subscriptions[idx]!, planId: plan.id, status: opts.status, provider: opts.provider,
      currentPeriodStart: opts.periodStart, currentPeriodEnd: opts.periodEnd,
      cancelAtPeriodEnd: false, canceledAt: null, updatedAt: new Date(),
    };
    ms.subscriptions[idx] = next;
    return next;
  }
  const updated = await getDb().update(subscriptions).set({
    planId: plan.id, status: opts.status, provider: opts.provider,
    currentPeriodStart: opts.periodStart, currentPeriodEnd: opts.periodEnd,
    cancelAtPeriodEnd: false, canceledAt: null, updatedAt: new Date(),
  }).where(eq(subscriptions.id, sub.id)).returning();
  return updated[0]!;
}

export async function startSubscriptionCheckout(input: {
  ownerId: number; storeId: number; planSlug: string; email: string;
}) {
  await assertStoreOwned(input.storeId, input.ownerId);
  const plan = await getPlanBySlug(input.planSlug);
  if (!plan || !plan.active) throw new Error("Plan not found");
  const sub = await ensureStoreSubscription(input.storeId);
  if (plan.priceKobo === 0) {
    const updated = await applyPlanToSubscription(sub, plan, {
      status: "active", periodStart: new Date(), periodEnd: null, provider: "none",
    });
    await recordEvent(updated.id, "plan_changed_free", null, { planSlug: plan.slug });
    return { kind: "free" as const, subscription: updated, plan };
  }
  assertPositiveKobo(plan.priceKobo);
  const reference = makeReference(input.storeId, plan.slug);
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    ms.billingTransactions.push({
      id: ms.seq.billingTransaction++, storeId: input.storeId, subscriptionId: sub.id,
      provider: "paystack", reference, amountKobo: plan.priceKobo, currency: "NGN",
      status: "pending", transactionType: "subscription_checkout", planId: plan.id,
      rawEventId: null, createdAt: new Date(), updatedAt: new Date(),
    });
  } else {
    await getDb().insert(billingTransactions).values({
      storeId: input.storeId, subscriptionId: sub.id, provider: "paystack", reference,
      amountKobo: plan.priceKobo, currency: "NGN", status: "pending",
      transactionType: "subscription_checkout", planId: plan.id,
    });
  }
  const init = await initializePaystackTransaction({
    email: input.email, amountKobo: plan.priceKobo, reference,
    callbackUrl: `${appUrl()}/dashboard/billing?reference=${encodeURIComponent(reference)}`,
    metadata: { purpose: "subscription", storeId: input.storeId, planId: plan.id, planSlug: plan.slug, subscriptionId: sub.id },
  });
  return { kind: "checkout" as const, authorizationUrl: init.authorizationUrl, reference: init.reference, amountKobo: plan.priceKobo, plan };
}

export async function confirmSubscriptionPayment(input: {
  reference: string; amountKobo: number; currency?: string; rawEventId?: string | null;
}) {
  assertNonNegativeKobo(input.amountKobo);
  if (input.currency && input.currency !== "NGN") throw new Error("currency_mismatch");
  let tx: { id: number; storeId: number; subscriptionId: number | null; amountKobo: number; status: string; planId: number | null; reference: string } | null = null;
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    if (input.rawEventId && ms.billingTransactions.some((t) => t.rawEventId === input.rawEventId)) {
      const existing = ms.billingTransactions.find((t) => t.rawEventId === input.rawEventId)!;
      const sub = ms.subscriptions.find((s) => s.storeId === existing.storeId)!;
      const plan = (await getPlanById(existing.planId || sub.planId))!;
      return { alreadyProcessed: true, subscription: sub, plan };
    }
    tx = ms.billingTransactions.find((t) => t.reference === input.reference) ?? null;
  } else {
    if (input.rawEventId) {
      const dup = await getDb().select().from(billingTransactions).where(eq(billingTransactions.rawEventId, input.rawEventId)).limit(1);
      if (dup[0]) {
        const sub = await getStoreSubscription(dup[0].storeId);
        const plan = await getPlanById(dup[0].planId || sub!.planId);
        return { alreadyProcessed: true, subscription: sub!, plan: plan! };
      }
    }
    const rows = await getDb().select().from(billingTransactions).where(eq(billingTransactions.reference, input.reference)).limit(1);
    tx = rows[0] ?? null;
  }
  if (!tx) throw new Error("unknown_reference");
  if (tx.status === "success") {
    const sub = await getStoreSubscription(tx.storeId);
    const plan = await getPlanById(tx.planId || sub!.planId);
    return { alreadyProcessed: true, subscription: sub!, plan: plan! };
  }
  if (tx.amountKobo !== input.amountKobo) throw new Error("amount_mismatch");
  const plan = await getPlanById(tx.planId!);
  if (!plan) throw new Error("Plan not found");
  const sub = await ensureStoreSubscription(tx.storeId);
  const now = new Date();
  const updated = await applyPlanToSubscription(sub, plan, {
    status: "active", periodStart: now, periodEnd: addDays(now, PERIOD_DAYS), provider: "paystack",
  });
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const idx = ms.billingTransactions.findIndex((t) => t.reference === input.reference);
    if (idx >= 0) {
      ms.billingTransactions[idx] = {
        ...ms.billingTransactions[idx]!, status: "success",
        rawEventId: input.rawEventId ?? ms.billingTransactions[idx]!.rawEventId, updatedAt: new Date(),
      };
    }
  } else {
    await getDb().update(billingTransactions).set({
      status: "success", rawEventId: input.rawEventId ?? null, updatedAt: new Date(),
    }).where(eq(billingTransactions.reference, input.reference));
  }
  await recordEvent(updated.id, "payment_success", input.rawEventId ?? input.reference, { planSlug: plan.slug, amountKobo: input.amountKobo });
  return { alreadyProcessed: false, subscription: updated, plan };
}

export async function cancelSubscription(input: { ownerId: number; storeId: number; immediate?: boolean }) {
  await assertStoreOwned(input.storeId, input.ownerId);
  const sub = await ensureStoreSubscription(input.storeId);
  const free = await getFreePlan();
  if (input.immediate || !sub.currentPeriodEnd) {
    if (useMemory()) {
      const ms = mem.getMemoryStore();
      const idx = ms.subscriptions.findIndex((s) => s.id === sub.id);
      ms.subscriptions[idx] = {
        ...ms.subscriptions[idx]!, planId: free.id, status: "canceled", cancelAtPeriodEnd: false,
        canceledAt: new Date(), currentPeriodEnd: new Date(), updatedAt: new Date(),
      };
      await recordEvent(sub.id, "canceled_immediate", null);
      return ms.subscriptions[idx]!;
    }
    const rows = await getDb().update(subscriptions).set({
      cancelAtPeriodEnd: false, canceledAt: new Date(), status: "canceled", planId: free.id,
      currentPeriodEnd: new Date(), updatedAt: new Date(),
    }).where(eq(subscriptions.id, sub.id)).returning();
    await recordEvent(sub.id, "canceled_immediate", null);
    return rows[0]!;
  }
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const idx = ms.subscriptions.findIndex((s) => s.id === sub.id);
    ms.subscriptions[idx] = { ...ms.subscriptions[idx]!, cancelAtPeriodEnd: true, canceledAt: new Date(), updatedAt: new Date() };
    await recordEvent(sub.id, "cancel_at_period_end", null);
    return ms.subscriptions[idx]!;
  }
  const rows = await getDb().update(subscriptions).set({
    cancelAtPeriodEnd: true, canceledAt: new Date(), updatedAt: new Date(),
  }).where(eq(subscriptions.id, sub.id)).returning();
  await recordEvent(sub.id, "cancel_at_period_end", null);
  return rows[0]!;
}

export async function resumeSubscription(input: { ownerId: number; storeId: number }) {
  await assertStoreOwned(input.storeId, input.ownerId);
  const sub = await ensureStoreSubscription(input.storeId);
  if (!sub.cancelAtPeriodEnd) return sub;
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const idx = ms.subscriptions.findIndex((s) => s.id === sub.id);
    ms.subscriptions[idx] = { ...ms.subscriptions[idx]!, cancelAtPeriodEnd: false, canceledAt: null, status: "active", updatedAt: new Date() };
    await recordEvent(sub.id, "resumed", null);
    return ms.subscriptions[idx]!;
  }
  const rows = await getDb().update(subscriptions).set({
    cancelAtPeriodEnd: false, canceledAt: null, status: "active", updatedAt: new Date(),
  }).where(eq(subscriptions.id, sub.id)).returning();
  await recordEvent(sub.id, "resumed", null);
  return rows[0]!;
}

export async function listBillingHistory(storeId: number, limit = 50) {
  if (useMemory()) {
    return mem.getMemoryStore().billingTransactions.filter((t) => t.storeId === storeId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  }
  return getDb().select().from(billingTransactions).where(eq(billingTransactions.storeId, storeId))
    .orderBy(desc(billingTransactions.createdAt)).limit(limit);
}

export async function getBillingSummary(storeId: number) {
  const sub = await ensureStoreSubscription(storeId);
  const plan = await getEffectivePlanForStore(storeId);
  const status = computeEffectiveStatus(sub);
  const history = await listBillingHistory(storeId, 20);
  const allPlans = await listActivePlans();
  return {
    subscription: {
      id: sub.id, status, rawStatus: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      currentPeriodStart: sub.currentPeriodStart ? sub.currentPeriodStart.toISOString() : null,
      currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
      canceledAt: sub.canceledAt ? sub.canceledAt.toISOString() : null,
    },
    plan: {
      id: plan.id, name: plan.name, slug: plan.slug, description: plan.description,
      priceKobo: plan.priceKobo, billingInterval: plan.billingInterval, productLimit: plan.productLimit, features: plan.features,
    },
    plans: allPlans.map((p) => ({
      id: p.id, name: p.name, slug: p.slug, description: p.description, priceKobo: p.priceKobo,
      billingInterval: p.billingInterval, productLimit: p.productLimit, features: p.features,
    })),
    history: history.map((t) => ({
      id: t.id, reference: t.reference, amountKobo: t.amountKobo, status: t.status,
      transactionType: t.transactionType,
      createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    })),
  };
}

export async function verifyAndConfirmSubscriptionReference(reference: string) {
  const verified = await verifyPaystackTransaction(reference);
  if (verified.status !== "success") throw new Error("payment_not_successful");
  let expected = verified.amountKobo;
  if (useMemory()) {
    const tx = mem.getMemoryStore().billingTransactions.find((t) => t.reference === reference);
    if (tx && expected === 0) expected = tx.amountKobo;
  } else if (expected === 0) {
    const rows = await getDb().select().from(billingTransactions).where(eq(billingTransactions.reference, reference)).limit(1);
    if (rows[0]) expected = rows[0].amountKobo;
  }
  return confirmSubscriptionPayment({ reference, amountKobo: expected, currency: verified.currency });
}
