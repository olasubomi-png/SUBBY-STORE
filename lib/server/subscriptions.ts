/**
 * Seller subscription & billing core with Paystack recurring support.
 * Database remains source of truth; Paystack handles automatic renewals.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  billingTransactions, subscriptionEvents, subscriptionPlans, subscriptions, stores,
} from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import {
  initializePaystackTransaction,
  verifyPaystackTransaction,
  createPaystackPlan,
  createPaystackSubscription,
  disablePaystackSubscription,
  enablePaystackSubscription,
  appUrl,
  isPaystackMock,
} from "@/lib/server/paystack";
import { assertNonNegativeKobo, assertPositiveKobo } from "@/lib/money";

export type PlanFeatures = {
  campaigns: boolean; coupons: boolean; advancedAnalytics: boolean;
  advancedCustomers: boolean; advancedMarketing: boolean; fullCustomization: boolean;
};
export type SubscriptionPlanRow = {
  id: number; name: string; slug: string; description: string; priceKobo: number;
  billingInterval: string; productLimit: number | null; featuresJson: string;
  features: PlanFeatures; active: boolean; sortOrder: number;
  providerPlanCode: string | null;
};
export type SubscriptionRow = {
  id: number; storeId: number; planId: number; status: string; provider: string;
  providerSubscriptionCode: string | null; providerCustomerCode: string | null;
  providerAuthorizationCode: string | null; providerEmailToken: string | null;
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

/** Optional env overrides: PAYSTACK_PLAN_PRO, PAYSTACK_PLAN_BUSINESS */
function envPlanCode(slug: string): string | null {
  const key = `PAYSTACK_PLAN_${slug.toUpperCase()}`;
  const v = process.env[key]?.trim();
  return v || null;
}

export function seedMemoryPlans(): void {
  const ms = mem.getMemoryStore();
  if (ms.subscriptionPlans.length > 0) return;
  for (const p of SEED_PLANS) {
    ms.subscriptionPlans.push({
      id: ms.seq.subscriptionPlan++, name: p.name, slug: p.slug, description: p.description,
      priceKobo: p.priceKobo, billingInterval: "monthly", productLimit: p.productLimit,
      featuresJson: JSON.stringify(p.features),
      providerPlanCode: envPlanCode(p.slug) || (p.priceKobo > 0 ? `PLN_mock_${p.slug}` : null),
      active: true, sortOrder: p.sortOrder,
      createdAt: new Date(), updatedAt: new Date(),
    });
  }
}

function mapPlanRow(p: {
  id: number; name: string; slug: string; description: string; priceKobo: number;
  billingInterval: string; productLimit: number | null; featuresJson: string;
  active: boolean; sortOrder: number; providerPlanCode?: string | null;
}): SubscriptionPlanRow {
  return withFeatures({
    id: p.id, name: p.name, slug: p.slug, description: p.description, priceKobo: p.priceKobo,
    billingInterval: p.billingInterval, productLimit: p.productLimit, featuresJson: p.featuresJson,
    active: p.active, sortOrder: p.sortOrder,
    providerPlanCode: p.providerPlanCode ?? envPlanCode(p.slug),
  });
}

export async function listActivePlans(): Promise<SubscriptionPlanRow[]> {
  if (useMemory()) {
    seedMemoryPlans();
    return mem.getMemoryStore().subscriptionPlans.filter((p) => p.active)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((p) => mapPlanRow(p));
  }
  const rows = await getDb().select().from(subscriptionPlans).where(eq(subscriptionPlans.active, true));
  rows.sort((a, b) => a.sortOrder - b.sortOrder);
  return rows.map((p) => mapPlanRow(p));
}

export async function getPlanBySlug(slug: string) {
  return (await listActivePlans()).find((p) => p.slug === slug) ?? null;
}

export async function getPlanById(id: number) {
  if (useMemory()) {
    seedMemoryPlans();
    const p = mem.getMemoryStore().subscriptionPlans.find((x) => x.id === id);
    return p ? mapPlanRow(p) : null;
  }
  const rows = await getDb().select().from(subscriptionPlans).where(eq(subscriptionPlans.id, id)).limit(1);
  const p = rows[0];
  return p ? mapPlanRow(p) : null;
}

/**
 * Ensure a Paystack plan code exists for this local plan (create if needed).
 * Stores providerPlanCode on the plan row.
 */
export async function ensureProviderPlanCode(plan: SubscriptionPlanRow): Promise<string | null> {
  if (plan.priceKobo === 0) return null;
  const envCode = envPlanCode(plan.slug);
  if (envCode) return envCode;
  if (plan.providerPlanCode) return plan.providerPlanCode;

  const interval = plan.billingInterval === "annually" ? "annually" as const : "monthly" as const;
  const created = await createPaystackPlan({
    name: `SUBBY ${plan.name}`,
    amountKobo: plan.priceKobo,
    interval,
    description: plan.description,
  });

  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const idx = ms.subscriptionPlans.findIndex((p) => p.id === plan.id);
    if (idx >= 0) {
      ms.subscriptionPlans[idx] = { ...ms.subscriptionPlans[idx]!, providerPlanCode: created.planCode };
    }
  } else {
    await getDb().update(subscriptionPlans).set({
      providerPlanCode: created.planCode,
      updatedAt: new Date(),
    }).where(eq(subscriptionPlans.id, plan.id));
  }
  return created.planCode;
}

async function getFreePlan() {
  const free = await getPlanBySlug("free");
  if (!free) throw new Error("Free plan is not configured");
  return free;
}

export async function getStoreSubscription(storeId: number): Promise<SubscriptionRow | null> {
  if (useMemory()) return mem.getMemoryStore().subscriptions.find((s) => s.storeId === storeId) ?? null;
  const rows = await getDb().select().from(subscriptions).where(eq(subscriptions.storeId, storeId)).limit(1);
  return (rows[0] as SubscriptionRow | undefined) ?? null;
}

export async function getSubscriptionByProviderCode(
  providerSubscriptionCode: string
): Promise<SubscriptionRow | null> {
  if (useMemory()) {
    return mem.getMemoryStore().subscriptions.find(
      (s) => s.providerSubscriptionCode === providerSubscriptionCode
    ) ?? null;
  }
  const rows = await getDb().select().from(subscriptions)
    .where(eq(subscriptions.providerSubscriptionCode, providerSubscriptionCode)).limit(1);
  return (rows[0] as SubscriptionRow | undefined) ?? null;
}

export async function getSubscriptionByCustomerCode(
  customerCode: string
): Promise<SubscriptionRow | null> {
  if (useMemory()) {
    return mem.getMemoryStore().subscriptions.find(
      (s) => s.providerCustomerCode === customerCode
    ) ?? null;
  }
  const rows = await getDb().select().from(subscriptions)
    .where(eq(subscriptions.providerCustomerCode, customerCode)).limit(1);
  return (rows[0] as SubscriptionRow | undefined) ?? null;
}

export async function ensureStoreSubscription(storeId: number): Promise<SubscriptionRow> {
  const existing = await getStoreSubscription(storeId);
  if (existing) return refreshSubscriptionStatus(existing);
  const free = await getFreePlan();
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const row: SubscriptionRow = {
      id: ms.seq.subscription++, storeId, planId: free.id, status: "active", provider: "none",
      providerSubscriptionCode: null, providerCustomerCode: null,
      providerAuthorizationCode: null, providerEmailToken: null,
      currentPeriodStart: new Date(), currentPeriodEnd: null,
      cancelAtPeriodEnd: false, canceledAt: null, createdAt: new Date(), updatedAt: new Date(),
    };
    ms.subscriptions.push(row);
    return row;
  }
  const inserted = await getDb().insert(subscriptions).values({
    storeId, planId: free.id, status: "active", provider: "none", currentPeriodStart: new Date(),
  }).returning();
  return inserted[0] as SubscriptionRow;
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
  // Period ended while still "active"
  if (sub.currentPeriodEnd && sub.currentPeriodEnd.getTime() < now.getTime()) {
    // Voluntary non-renewal: no payment grace
    if (sub.cancelAtPeriodEnd) {
      return "canceled";
    }
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
        ...(effective === "expired" || effective === "canceled"
          ? { cancelAtPeriodEnd: false, providerSubscriptionCode: null }
          : {}),
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
    ...(effective === "expired" || effective === "canceled"
      ? { planId: free.id, cancelAtPeriodEnd: false, providerSubscriptionCode: null }
      : {}),
  }).where(eq(subscriptions.id, sub.id)).returning();
  return (updated[0] as SubscriptionRow) ?? sub;
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
function parseDate(v: string | null | undefined): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
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

async function patchSubscription(
  subId: number,
  patch: Partial<SubscriptionRow>
): Promise<SubscriptionRow> {
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const idx = ms.subscriptions.findIndex((s) => s.id === subId);
    if (idx < 0) throw new Error("Subscription not found");
    ms.subscriptions[idx] = { ...ms.subscriptions[idx]!, ...patch, updatedAt: new Date() };
    return ms.subscriptions[idx]!;
  }
  const updated = await getDb().update(subscriptions).set({
    ...patch,
    updatedAt: new Date(),
  } as Record<string, unknown>).where(eq(subscriptions.id, subId)).returning();
  return updated[0] as SubscriptionRow;
}

/**
 * Start checkout for a paid plan with Paystack plan code (recurring).
 * Free plan is applied immediately.
 */
export async function startSubscriptionCheckout(input: {
  ownerId: number; storeId: number; planSlug: string; email: string;
}) {
  await assertStoreOwned(input.storeId, input.ownerId);
  const plan = await getPlanBySlug(input.planSlug);
  if (!plan || !plan.active) throw new Error("Plan not found");
  const sub = await ensureStoreSubscription(input.storeId);

  if (plan.priceKobo === 0) {
    // Switching to free: disable Paystack subscription if any
    if (sub.providerSubscriptionCode) {
      try { await disablePaystackSubscription(sub.providerSubscriptionCode); } catch { /* best-effort */ }
    }
    const updated = await patchSubscription(sub.id, {
      planId: plan.id, status: "active", provider: "none",
      providerSubscriptionCode: null, currentPeriodStart: new Date(), currentPeriodEnd: null,
      cancelAtPeriodEnd: false, canceledAt: null,
    });
    await recordEvent(updated.id, "plan_changed_free", null, { planSlug: plan.slug });
    return { kind: "free" as const, subscription: updated, plan };
  }

  assertPositiveKobo(plan.priceKobo);
  const planCode = await ensureProviderPlanCode(plan);
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
    planCode,
    metadata: {
      purpose: "subscription",
      storeId: input.storeId,
      planId: plan.id,
      planSlug: plan.slug,
      subscriptionId: sub.id,
      planCode,
    },
  });

  return {
    kind: "checkout" as const,
    authorizationUrl: init.authorizationUrl,
    reference: init.reference,
    amountKobo: plan.priceKobo,
    plan,
    recurring: Boolean(planCode),
  };
}

/**
 * Confirm successful subscription payment (initial or verify path).
 * Saves Paystack customer/authorization/subscription codes and activates plan.
 */
export async function confirmSubscriptionPayment(input: {
  reference: string; amountKobo: number; currency?: string; rawEventId?: string | null;
  authorizationCode?: string | null;
  customerCode?: string | null;
  subscriptionCode?: string | null;
  nextPaymentDate?: string | null;
  planCode?: string | null;
}): Promise<{
  alreadyProcessed: boolean;
  subscription: SubscriptionRow;
  plan: SubscriptionPlanRow;
}> {
  assertNonNegativeKobo(input.amountKobo);
  if (input.currency && input.currency !== "NGN") throw new Error("currency_mismatch");

  type Tx = {
    id: number; storeId: number; subscriptionId: number | null; amountKobo: number;
    status: string; planId: number | null; reference: string; transactionType: string;
  };
  let tx: Tx | null = null;

  if (useMemory()) {
    const ms = mem.getMemoryStore();
    if (input.rawEventId && ms.billingTransactions.some((t) => t.rawEventId === input.rawEventId)) {
      const existing = ms.billingTransactions.find((t) => t.rawEventId === input.rawEventId)!;
      const sub = ms.subscriptions.find((s) => s.storeId === existing.storeId)!;
      const plan = (await getPlanById(existing.planId || sub.planId))!;
      return { alreadyProcessed: true, subscription: sub, plan };
    }
    tx = (ms.billingTransactions.find((t) => t.reference === input.reference) as Tx | undefined) ?? null;
  } else {
    if (input.rawEventId) {
      const dup = await getDb().select().from(billingTransactions)
        .where(eq(billingTransactions.rawEventId, input.rawEventId)).limit(1);
      if (dup[0]) {
        const sub = await getStoreSubscription(dup[0].storeId);
        const plan = await getPlanById(dup[0].planId || sub!.planId);
        return { alreadyProcessed: true, subscription: sub!, plan: plan! };
      }
    }
    const rows = await getDb().select().from(billingTransactions)
      .where(eq(billingTransactions.reference, input.reference)).limit(1);
    tx = (rows[0] as Tx | undefined) ?? null;
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
  let periodEnd = parseDate(input.nextPaymentDate) || addDays(now, PERIOD_DAYS);

  let subscriptionCode = input.subscriptionCode ?? null;
  let customerCode = input.customerCode ?? null;
  let authorizationCode = input.authorizationCode ?? null;
  let emailToken: string | null = null;

  // If charge succeeded with auth but no subscription yet, create one on Paystack
  const planCode = input.planCode || plan.providerPlanCode || (await ensureProviderPlanCode(plan));
  if (!subscriptionCode && customerCode && planCode && authorizationCode) {
    try {
      const created = await createPaystackSubscription({
        customerCode, planCode, authorizationCode,
      });
      subscriptionCode = created.subscriptionCode;
      emailToken = created.emailToken;
      if (created.nextPaymentDate) {
        const np = parseDate(created.nextPaymentDate);
        if (np) periodEnd = np;
      }
    } catch {
      // Subscription may already exist from plan-linked initialize; continue with auth codes
    }
  }

  const updated = await patchSubscription(sub.id, {
    planId: plan.id,
    status: "active",
    provider: "paystack",
    providerSubscriptionCode: subscriptionCode ?? sub.providerSubscriptionCode,
    providerCustomerCode: customerCode ?? sub.providerCustomerCode,
    providerAuthorizationCode: authorizationCode ?? sub.providerAuthorizationCode,
    providerEmailToken: emailToken ?? sub.providerEmailToken,
    currentPeriodStart: now,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: false,
    canceledAt: null,
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

  await recordEvent(
    updated.id,
    tx.transactionType === "renewal" ? "renewal_success" : "payment_success",
    input.rawEventId ?? input.reference,
    { planSlug: plan.slug, amountKobo: input.amountKobo, subscriptionCode, customerCode }
  );

  return { alreadyProcessed: false, subscription: updated, plan };
}

/** Handle successful recurring charge (webhook). Extends period, same plan. */
export async function confirmRenewalPayment(input: {
  reference: string;
  amountKobo: number;
  currency?: string;
  rawEventId?: string | null;
  customerCode?: string | null;
  subscriptionCode?: string | null;
  nextPaymentDate?: string | null;
}): Promise<{ alreadyProcessed: boolean; subscription: SubscriptionRow; plan: SubscriptionPlanRow }> {
  assertNonNegativeKobo(input.amountKobo);
  if (input.currency && input.currency !== "NGN") throw new Error("currency_mismatch");

  // Idempotent on rawEventId
  if (input.rawEventId) {
    if (useMemory()) {
      const ms = mem.getMemoryStore();
      if (ms.billingTransactions.some((t) => t.rawEventId === input.rawEventId)) {
        const existing = ms.billingTransactions.find((t) => t.rawEventId === input.rawEventId)!;
        const sub = ms.subscriptions.find((s) => s.storeId === existing.storeId)!;
        const plan = (await getPlanById(sub.planId))!;
        return { alreadyProcessed: true, subscription: sub, plan };
      }
    } else {
      const dup = await getDb().select().from(billingTransactions)
        .where(eq(billingTransactions.rawEventId, input.rawEventId)).limit(1);
      if (dup[0]) {
        const sub = await getStoreSubscription(dup[0].storeId);
        const plan = await getPlanById(sub!.planId);
        return { alreadyProcessed: true, subscription: sub!, plan: plan! };
      }
    }
  }

  // Also idempotent on reference
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const byRef = ms.billingTransactions.find((t) => t.reference === input.reference);
    if (byRef?.status === "success") {
      const sub = ms.subscriptions.find((s) => s.storeId === byRef.storeId)!;
      const plan = (await getPlanById(sub.planId))!;
      return { alreadyProcessed: true, subscription: sub, plan };
    }
  } else {
    const byRef = await getDb().select().from(billingTransactions)
      .where(eq(billingTransactions.reference, input.reference)).limit(1);
    if (byRef[0]?.status === "success") {
      const sub = await getStoreSubscription(byRef[0].storeId);
      const plan = await getPlanById(sub!.planId);
      return { alreadyProcessed: true, subscription: sub!, plan: plan! };
    }
  }

  let sub: SubscriptionRow | null = null;
  if (input.subscriptionCode) {
    sub = await getSubscriptionByProviderCode(input.subscriptionCode);
  }
  if (!sub && input.customerCode) {
    sub = await getSubscriptionByCustomerCode(input.customerCode);
  }
  if (!sub) throw new Error("subscription_not_found");

  const plan = await getPlanById(sub.planId);
  if (!plan) throw new Error("Plan not found");

  // Record billing transaction
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    if (!ms.billingTransactions.some((t) => t.reference === input.reference)) {
      ms.billingTransactions.push({
        id: ms.seq.billingTransaction++, storeId: sub.storeId, subscriptionId: sub.id,
        provider: "paystack", reference: input.reference, amountKobo: input.amountKobo,
        currency: "NGN", status: "success", transactionType: "renewal", planId: plan.id,
        rawEventId: input.rawEventId ?? null, createdAt: new Date(), updatedAt: new Date(),
      });
    }
  } else {
    try {
      await getDb().insert(billingTransactions).values({
        storeId: sub.storeId, subscriptionId: sub.id, provider: "paystack",
        reference: input.reference, amountKobo: input.amountKobo, currency: "NGN",
        status: "success", transactionType: "renewal", planId: plan.id,
        rawEventId: input.rawEventId ?? null,
      });
    } catch {
      // unique reference — already processed
      const sub2 = await getStoreSubscription(sub.storeId);
      return { alreadyProcessed: true, subscription: sub2!, plan };
    }
  }

  const now = new Date();
  const periodStart = sub.currentPeriodEnd && sub.currentPeriodEnd > now ? sub.currentPeriodEnd : now;
  const periodEnd = parseDate(input.nextPaymentDate) || addDays(periodStart, PERIOD_DAYS);

  const updated = await patchSubscription(sub.id, {
    status: "active",
    currentPeriodStart: periodStart,
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  });

  await recordEvent(updated.id, "renewal_success", input.rawEventId ?? input.reference, {
    amountKobo: input.amountKobo, planSlug: plan.slug,
  });

  return { alreadyProcessed: false, subscription: updated, plan };
}

async function resolveSubByProvider(input: {
  subscriptionCode?: string | null;
  customerCode?: string | null;
}): Promise<SubscriptionRow | null> {
  let sub: SubscriptionRow | null = null;
  if (input.subscriptionCode) sub = await getSubscriptionByProviderCode(input.subscriptionCode);
  if (!sub && input.customerCode) sub = await getSubscriptionByCustomerCode(input.customerCode);
  return sub;
}

function alreadyRecordedProviderEvent(providerEventId: string | null | undefined): boolean {
  if (!providerEventId || !useMemory()) return false;
  return mem.getMemoryStore().subscriptionEvents.some((e) => e.providerEventId === providerEventId);
}

/** Failed renewal payment → past_due (3-day grace), then expire via refresh. */
export async function markSubscriptionPastDue(input: {
  subscriptionCode?: string | null;
  customerCode?: string | null;
  rawEventId?: string | null;
}): Promise<SubscriptionRow | null> {
  const sub = await resolveSubByProvider(input);
  if (!sub) return null;

  if (alreadyRecordedProviderEvent(input.rawEventId)) {
    return refreshSubscriptionStatus(sub);
  }

  if (sub.status === "past_due" || sub.status === "expired" || sub.status === "canceled") {
    await recordEvent(sub.id, "renewal_failed", input.rawEventId ?? null);
    return refreshSubscriptionStatus(sub);
  }

  const updated = await patchSubscription(sub.id, { status: "past_due" });
  await recordEvent(updated.id, "renewal_failed", input.rawEventId ?? null);
  return refreshSubscriptionStatus(updated);
}

/**
 * Paystack subscription.not_renew — will not renew.
 * Keep paid plan until currentPeriodEnd. No past_due / no payment grace.
 */
export async function markSubscriptionNonRenewing(input: {
  subscriptionCode?: string | null;
  customerCode?: string | null;
  rawEventId?: string | null;
}): Promise<SubscriptionRow | null> {
  const sub = await resolveSubByProvider(input);
  if (!sub) return null;

  if (alreadyRecordedProviderEvent(input.rawEventId)) {
    return refreshSubscriptionStatus(sub);
  }

  if (sub.cancelAtPeriodEnd || sub.status === "canceled" || sub.status === "expired") {
    await recordEvent(sub.id, "provider_not_renew", input.rawEventId ?? null);
    return refreshSubscriptionStatus(sub);
  }

  const updated = await patchSubscription(sub.id, {
    cancelAtPeriodEnd: true,
    canceledAt: sub.canceledAt ?? new Date(),
  });
  await recordEvent(updated.id, "provider_not_renew", input.rawEventId ?? null);
  return refreshSubscriptionStatus(updated);
}

/**
 * Paystack subscription.disable — provider terminated subscription.
 * Period remaining: non-renewing access until currentPeriodEnd (not past_due).
 * Period ended: canceled + Free fallback.
 */
export async function markSubscriptionDisabledByProvider(input: {
  subscriptionCode?: string | null;
  customerCode?: string | null;
  rawEventId?: string | null;
}): Promise<SubscriptionRow | null> {
  const sub = await resolveSubByProvider(input);
  if (!sub) return null;

  if (alreadyRecordedProviderEvent(input.rawEventId)) {
    return refreshSubscriptionStatus(sub);
  }

  const now = new Date();
  const periodActive =
    sub.currentPeriodEnd != null && sub.currentPeriodEnd.getTime() > now.getTime();

  if (periodActive) {
    if (sub.cancelAtPeriodEnd && sub.status !== "past_due") {
      await recordEvent(sub.id, "provider_disable", input.rawEventId ?? null);
      return refreshSubscriptionStatus(sub);
    }
    const updated = await patchSubscription(sub.id, {
      cancelAtPeriodEnd: true,
      canceledAt: sub.canceledAt ?? new Date(),
      // Clear mistaken past_due from older webhook routing
      status: sub.status === "past_due" ? "active" : sub.status,
    });
    await recordEvent(updated.id, "provider_disable", input.rawEventId ?? null);
    return refreshSubscriptionStatus(updated);
  }

  const free = await getFreePlan();
  if (sub.status === "canceled" || sub.status === "expired") {
    await recordEvent(sub.id, "provider_disable", input.rawEventId ?? null);
    return refreshSubscriptionStatus(sub);
  }
  const updated = await patchSubscription(sub.id, {
    planId: free.id,
    status: "canceled",
    cancelAtPeriodEnd: false,
    canceledAt: sub.canceledAt ?? new Date(),
    providerSubscriptionCode: null,
  });
  await recordEvent(updated.id, "provider_disable", input.rawEventId ?? null);
  return refreshSubscriptionStatus(updated);
}

export async function cancelSubscription(input: {
  ownerId: number; storeId: number; immediate?: boolean;
}) {
  await assertStoreOwned(input.storeId, input.ownerId);
  const sub = await ensureStoreSubscription(input.storeId);
  const free = await getFreePlan();

  if (input.immediate || !sub.currentPeriodEnd) {
    if (sub.providerSubscriptionCode) {
      try { await disablePaystackSubscription(sub.providerSubscriptionCode); } catch { /* best-effort */ }
    }
    const updated = await patchSubscription(sub.id, {
      planId: free.id, status: "canceled", cancelAtPeriodEnd: false,
      canceledAt: new Date(), currentPeriodEnd: new Date(),
      providerSubscriptionCode: null,
    });
    await recordEvent(sub.id, "canceled_immediate", null);
    return updated;
  }

  // Cancel at period end — disable Paystack renewals, keep access until period end
  if (sub.providerSubscriptionCode) {
    try { await disablePaystackSubscription(sub.providerSubscriptionCode); } catch { /* best-effort */ }
  }
  const updated = await patchSubscription(sub.id, {
    cancelAtPeriodEnd: true, canceledAt: new Date(),
  });
  await recordEvent(sub.id, "cancel_at_period_end", null);
  return updated;
}

export async function resumeSubscription(input: {
  ownerId: number; storeId: number;
}) {
  await assertStoreOwned(input.storeId, input.ownerId);
  const sub = await ensureStoreSubscription(input.storeId);
  if (!sub.cancelAtPeriodEnd) return sub;

  if (sub.providerSubscriptionCode) {
    try { await enablePaystackSubscription(sub.providerSubscriptionCode); } catch { /* may need new checkout */ }
  }

  const updated = await patchSubscription(sub.id, {
    cancelAtPeriodEnd: false, canceledAt: null, status: "active",
  });
  await recordEvent(sub.id, "resumed", null);
  return updated;
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
      hasProviderSubscription: Boolean(sub.providerSubscriptionCode),
      recurring: Boolean(sub.providerSubscriptionCode) && !sub.cancelAtPeriodEnd && status === "active",
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
    const rows = await getDb().select().from(billingTransactions)
      .where(eq(billingTransactions.reference, reference)).limit(1);
    if (rows[0]) expected = rows[0].amountKobo;
  }
  return confirmSubscriptionPayment({
    reference,
    amountKobo: expected,
    currency: verified.currency,
    authorizationCode: verified.authorizationCode,
    customerCode: verified.customerCode,
    subscriptionCode: verified.subscriptionCode,
    nextPaymentDate: verified.nextPaymentDate,
    planCode: verified.planCode,
  });
}
