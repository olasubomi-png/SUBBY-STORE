import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import { getDb } from "@/db/client";
import { products } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import {
  ensureStoreSubscription,
  getEffectivePlanForStore,
  type PlanFeatures,
  type SubscriptionPlanRow,
} from "@/lib/server/subscriptions";

export type EntitlementResult =
  | { allowed: true; plan: SubscriptionPlanRow; features: PlanFeatures }
  | { allowed: false; plan: SubscriptionPlanRow; features: PlanFeatures; code: string; message: string };

async function countActiveProducts(storeId: number): Promise<number> {
  if (useMemory()) {
    return mem.getMemoryStore().products.filter((p) => p.storeId === storeId && p.active).length;
  }
  const rows = await getDb()
    .select({ c: sql<number>`count(*)::int` })
    .from(products)
    .where(and(eq(products.storeId, storeId), eq(products.active, true)));
  return Number(rows[0]?.c ?? 0);
}

export async function getStoreEntitlements(storeId: number) {
  await ensureStoreSubscription(storeId);
  const plan = await getEffectivePlanForStore(storeId);
  return { plan, features: plan.features };
}

export async function canCreateProduct(storeId: number): Promise<EntitlementResult> {
  const { plan, features } = await getStoreEntitlements(storeId);
  if (plan.productLimit == null) return { allowed: true, plan, features };
  const count = await countActiveProducts(storeId);
  if (count >= plan.productLimit) {
    return {
      allowed: false, plan, features, code: "product_limit",
      message: `You've reached the ${plan.productLimit}-product limit on the ${plan.name} plan. Upgrade to add more products.`,
    };
  }
  return { allowed: true, plan, features };
}

export async function canUseCampaigns(storeId: number): Promise<EntitlementResult> {
  const { plan, features } = await getStoreEntitlements(storeId);
  if (!features.campaigns) {
    return {
      allowed: false, plan, features, code: "feature_campaigns",
      message: `Campaigns are not included on the ${plan.name} plan. Upgrade to Pro or Business to run campaigns.`,
    };
  }
  return { allowed: true, plan, features };
}

export async function canUseCoupons(storeId: number): Promise<EntitlementResult> {
  const { plan, features } = await getStoreEntitlements(storeId);
  if (!features.coupons) {
    return {
      allowed: false, plan, features, code: "feature_coupons",
      message: `Coupons are not included on the ${plan.name} plan. Upgrade to Pro or Business to create discounts.`,
    };
  }
  return { allowed: true, plan, features };
}

export async function canUseAdvancedAnalytics(storeId: number): Promise<EntitlementResult> {
  const { plan, features } = await getStoreEntitlements(storeId);
  if (!features.advancedAnalytics) {
    return { allowed: false, plan, features, code: "feature_analytics", message: `Advanced analytics require the Pro or Business plan.` };
  }
  return { allowed: true, plan, features };
}

export async function canUseAdvancedCustomerManagement(storeId: number): Promise<EntitlementResult> {
  const { plan, features } = await getStoreEntitlements(storeId);
  if (!features.advancedCustomers) {
    return { allowed: false, plan, features, code: "feature_customers", message: `Advanced customer management requires the Pro or Business plan.` };
  }
  return { allowed: true, plan, features };
}

export async function canUseAdvancedMarketing(storeId: number): Promise<EntitlementResult> {
  const { plan, features } = await getStoreEntitlements(storeId);
  if (!features.advancedMarketing) {
    return { allowed: false, plan, features, code: "feature_marketing", message: `Advanced marketing tools require the Pro or Business plan.` };
  }
  return { allowed: true, plan, features };
}
