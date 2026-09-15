/**
 * Seller marketing campaigns. Ownership always resolved server-side.
 */
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { campaigns, campaignProducts, coupons, products, stores } from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import { slugify, isValidSlug } from "@/lib/slug";
import {
  canTransition, isCampaignStatus, isCampaignType,
  type CampaignRow, type CampaignStatus, type CampaignType, type PublicCampaign,
} from "@/lib/campaigns/types";
import { createNotification } from "@/lib/server/notifications";
import { canUseCampaigns } from "@/lib/server/entitlements";

const NAME_MAX = 120, DESC_MAX = 2000, ANNOUNCE_MAX = 500, SLUG_MAX = 100;

function trimStr(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}
function parseOptionalDate(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
function assertDates(a: Date | null, b: Date | null) {
  if (a && b && b.getTime() <= a.getTime()) throw new Error("End date must be after start date");
}
function uniqueSlug(base: string, existing: string[]): string {
  let candidate = slugify(base).slice(0, SLUG_MAX) || "campaign";
  if (!isValidSlug(candidate)) candidate = "campaign";
  if (!existing.includes(candidate)) return candidate;
  for (let i = 2; i < 1000; i++) {
    const suffix = `-${i}`;
    const next = `${candidate.slice(0, SLUG_MAX - suffix.length)}${suffix}`;
    if (!existing.includes(next)) return next;
  }
  return `${candidate}-${Date.now().toString(36)}`.slice(0, SLUG_MAX);
}
function memStoreOwned(storeId: number, ownerId: number) {
  const s = mem.getMemoryStore().stores.find((x) => x.id === storeId);
  return s && s.ownerId === ownerId ? s : null;
}

export function isCampaignPubliclyVisible(
  c: { status: string; startsAt: Date | null; endsAt: Date | null },
  now = new Date()
): boolean {
  if (c.status !== "active") return false;
  if (c.startsAt && c.startsAt.getTime() > now.getTime()) return false;
  if (c.endsAt && c.endsAt.getTime() <= now.getTime()) return false;
  return true;
}

export function effectiveCampaignStatus(
  c: { status: string; endsAt: Date | null },
  now = new Date()
): CampaignStatus {
  const s = isCampaignStatus(c.status) ? c.status : "draft";
  if ((s === "active" || s === "scheduled" || s === "paused") && c.endsAt && c.endsAt.getTime() <= now.getTime()) {
    return "expired";
  }
  return s;
}

function serialize(c: CampaignRow) {
  return { ...c, productIds: c.productIds ?? [], effectiveStatus: effectiveCampaignStatus(c) };
}

async function loadProductIds(campaignId: number): Promise<number[]> {
  if (useMemory()) {
    return mem.getMemoryStore().campaignProducts.filter((l) => l.campaignId === campaignId).map((l) => l.productId);
  }
  const rows = await getDb().select({ productId: campaignProducts.productId }).from(campaignProducts).where(eq(campaignProducts.campaignId, campaignId));
  return rows.map((r) => r.productId);
}

async function setCampaignProducts(campaignId: number, storeId: number, productIds: number[]) {
  const unique = [...new Set(productIds.filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    for (const pid of unique) {
      if (!ms.products.find((x) => x.id === pid && x.storeId === storeId)) throw new Error("Product not found in store");
    }
    ms.campaignProducts = ms.campaignProducts.filter((l) => l.campaignId !== campaignId);
    for (const pid of unique) {
      ms.campaignProducts.push({ id: ms.seq.campaignProduct++, campaignId, productId: pid });
    }
    return;
  }
  const db = getDb();
  if (unique.length > 0) {
    const owned = await db.select({ id: products.id }).from(products).where(and(eq(products.storeId, storeId), inArray(products.id, unique)));
    if (owned.length !== unique.length) throw new Error("Product not found in store");
  }
  await db.delete(campaignProducts).where(eq(campaignProducts.campaignId, campaignId));
  if (unique.length > 0) await db.insert(campaignProducts).values(unique.map((productId) => ({ campaignId, productId })));
}

async function assertCouponOwned(storeId: number, couponId: number | null) {
  if (couponId == null) return;
  if (!Number.isSafeInteger(couponId) || couponId <= 0) throw new Error("Invalid coupon");
  if (useMemory()) {
    const c = mem.getMemoryStore().coupons.find((x) => x.id === couponId);
    if (!c || c.storeId !== storeId) throw new Error("Coupon not found");
    return;
  }
  const rows = await getDb().select({ id: coupons.id }).from(coupons).where(and(eq(coupons.id, couponId), eq(coupons.storeId, storeId))).limit(1);
  if (!rows[0]) throw new Error("Coupon not found");
}

async function maybeNotify(storeId: number, campaign: { id: number; name: string }, status: CampaignStatus) {
  try {
    if (status === "scheduled") {
      await createNotification({ storeId, type: "campaign_scheduled", title: "Campaign scheduled", message: `"${campaign.name}" is scheduled to go live.`, href: "/dashboard/marketing", dedupeKey: `campaign_scheduled_${campaign.id}` });
    } else if (status === "active") {
      await createNotification({ storeId, type: "campaign_started", title: "Campaign is live", message: `"${campaign.name}" is now active on your storefront.`, href: "/dashboard/marketing", dedupeKey: `campaign_started_${campaign.id}` });
    } else if (status === "expired") {
      await createNotification({ storeId, type: "campaign_expired", title: "Campaign ended", message: `"${campaign.name}" has expired.`, href: "/dashboard/marketing", dedupeKey: `campaign_expired_${campaign.id}` });
    }
  } catch { /* non-blocking */ }
}

export async function getCampaignOwned(ownerId: number, campaignId: number): Promise<CampaignRow | null> {
  if (useMemory()) {
    const c = mem.getMemoryStore().campaigns.find((x) => x.id === campaignId);
    if (!c) return null;
    if (!memStoreOwned(c.storeId, ownerId)) return null;
    return c;
  }
  const rows = await getDb().select({
    id: campaigns.id, storeId: campaigns.storeId, name: campaigns.name, slug: campaigns.slug,
    description: campaigns.description, campaignType: campaigns.campaignType, status: campaigns.status,
    startsAt: campaigns.startsAt, endsAt: campaigns.endsAt, bannerUrl: campaigns.bannerUrl,
    announcementText: campaigns.announcementText, couponId: campaigns.couponId,
    createdAt: campaigns.createdAt, updatedAt: campaigns.updatedAt, ownerId: stores.ownerId,
  }).from(campaigns).innerJoin(stores, eq(stores.id, campaigns.storeId)).where(eq(campaigns.id, campaignId)).limit(1);
  const row = rows[0];
  if (!row || row.ownerId !== ownerId) return null;
  const { ownerId: _o, ...rest } = row;
  return rest;
}

export async function listCampaignsForOwner(ownerId: number, storeId: number) {
  if (useMemory()) {
    if (!memStoreOwned(storeId, ownerId)) throw new Error("Store not found");
    const rows = mem.getMemoryStore().campaigns.filter((c) => c.storeId === storeId).sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    const out = [];
    for (const c of rows) out.push(serialize({ ...c, productIds: await loadProductIds(c.id) }));
    return out;
  }
  const owned = await getDb().select({ id: stores.id }).from(stores).where(and(eq(stores.id, storeId), eq(stores.ownerId, ownerId))).limit(1);
  if (!owned[0]) throw new Error("Store not found");
  const rows = await getDb().select().from(campaigns).where(eq(campaigns.storeId, storeId));
  rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  const out = [];
  for (const c of rows) {
    out.push(serialize({
      id: c.id, storeId: c.storeId, name: c.name, slug: c.slug, description: c.description,
      campaignType: c.campaignType, status: c.status, startsAt: c.startsAt, endsAt: c.endsAt,
      bannerUrl: c.bannerUrl, announcementText: c.announcementText, couponId: c.couponId,
      createdAt: c.createdAt, updatedAt: c.updatedAt, productIds: await loadProductIds(c.id),
    }));
  }
  return out;
}

export async function createCampaign(ownerId: number, input: {
  storeId: number; name: string; description?: string; campaignType: string; status?: string;
  startsAt?: string | Date | null; endsAt?: string | Date | null; bannerUrl?: string | null;
  announcementText?: string | null; couponId?: number | null; productIds?: number[]; slug?: string;
}) {
  const name = trimStr(input.name, NAME_MAX);
  if (name.length < 2) throw new Error("Campaign name is required");
  if (!isCampaignType(input.campaignType)) throw new Error("Invalid campaign type");
  {
    const ent = await canUseCampaigns(input.storeId);
    if (!ent.allowed) throw new Error(ent.message);
  }
  const status: CampaignStatus = input.status && isCampaignStatus(input.status) ? input.status : "draft";
  if (status === "expired") throw new Error("Cannot create an expired campaign");
  const startsAt = parseOptionalDate(input.startsAt ?? null);
  const endsAt = parseOptionalDate(input.endsAt ?? null);
  assertDates(startsAt, endsAt);
  if (status === "scheduled" && !startsAt) throw new Error("Scheduled campaigns require a start date");
  const description = trimStr(input.description ?? "", DESC_MAX);
  const announcementText = trimStr(input.announcementText ?? "", ANNOUNCE_MAX) || null;
  const bannerUrl = typeof input.bannerUrl === "string" && input.bannerUrl.trim() ? input.bannerUrl.trim().slice(0, 2000) : null;
  const couponId = input.couponId == null || input.couponId === 0 ? null : Number(input.couponId);

  if (useMemory()) {
    if (!memStoreOwned(input.storeId, ownerId)) throw new Error("Store not found");
    await assertCouponOwned(input.storeId, couponId);
    const existing = mem.getMemoryStore().campaigns.filter((c) => c.storeId === input.storeId).map((c) => c.slug);
    const slug = uniqueSlug(input.slug || name, existing);
    const ms = mem.getMemoryStore();
    const row = {
      id: ms.seq.campaign++, storeId: input.storeId, name, slug, description,
      campaignType: input.campaignType as CampaignType, status, startsAt, endsAt, bannerUrl,
      announcementText, couponId, createdAt: new Date(), updatedAt: new Date(),
    };
    ms.campaigns.push(row);
    await setCampaignProducts(row.id, input.storeId, input.productIds ?? []);
    await maybeNotify(input.storeId, row, status);
    return serialize({ ...row, productIds: await loadProductIds(row.id) });
  }

  const db = getDb();
  const owned = await db.select({ id: stores.id }).from(stores).where(and(eq(stores.id, input.storeId), eq(stores.ownerId, ownerId))).limit(1);
  if (!owned[0]) throw new Error("Store not found");
  await assertCouponOwned(input.storeId, couponId);
  const existingRows = await db.select({ slug: campaigns.slug }).from(campaigns).where(eq(campaigns.storeId, input.storeId));
  const slug = uniqueSlug(input.slug || name, existingRows.map((r) => r.slug));
  const inserted = await db.insert(campaigns).values({
    storeId: input.storeId, name, slug, description, campaignType: input.campaignType,
    status, startsAt, endsAt, bannerUrl, announcementText, couponId,
  }).returning();
  const row = inserted[0]!;
  await setCampaignProducts(row.id, input.storeId, input.productIds ?? []);
  await maybeNotify(input.storeId, row, status);
  return serialize({
    id: row.id, storeId: row.storeId, name: row.name, slug: row.slug, description: row.description,
    campaignType: row.campaignType, status: row.status, startsAt: row.startsAt, endsAt: row.endsAt,
    bannerUrl: row.bannerUrl, announcementText: row.announcementText, couponId: row.couponId,
    createdAt: row.createdAt, updatedAt: row.updatedAt, productIds: await loadProductIds(row.id),
  });
}

export async function updateCampaign(ownerId: number, campaignId: number, patch: {
  name?: string; description?: string; campaignType?: string; status?: string;
  startsAt?: string | Date | null; endsAt?: string | Date | null; bannerUrl?: string | null;
  announcementText?: string | null; couponId?: number | null; productIds?: number[];
}) {
  if (!Number.isSafeInteger(campaignId) || campaignId <= 0) throw new Error("Invalid campaign");
  const existing = await getCampaignOwned(ownerId, campaignId);
  if (!existing) throw new Error("Campaign not found");
  const nextStatus: CampaignStatus = patch.status != null
    ? (isCampaignStatus(patch.status) ? patch.status : (() => { throw new Error("Invalid status"); })())
    : (existing.status as CampaignStatus);
  if (!isCampaignStatus(existing.status)) throw new Error("Invalid existing status");
  if (!canTransition(existing.status as CampaignStatus, nextStatus)) {
    throw new Error(`Cannot change campaign from ${existing.status} to ${nextStatus}`);
  }
  if (patch.campaignType != null && !isCampaignType(patch.campaignType)) throw new Error("Invalid campaign type");
  const name = patch.name != null ? trimStr(patch.name, NAME_MAX) : existing.name;
  if (name.length < 2) throw new Error("Campaign name is required");
  const description = patch.description != null ? trimStr(patch.description, DESC_MAX) : existing.description;
  const announcementText = patch.announcementText !== undefined ? trimStr(patch.announcementText ?? "", ANNOUNCE_MAX) || null : existing.announcementText;
  const bannerUrl = patch.bannerUrl !== undefined
    ? (typeof patch.bannerUrl === "string" && patch.bannerUrl.trim() ? patch.bannerUrl.trim().slice(0, 2000) : null)
    : existing.bannerUrl;
  const startsAt = patch.startsAt !== undefined ? parseOptionalDate(patch.startsAt) : existing.startsAt;
  const endsAt = patch.endsAt !== undefined ? parseOptionalDate(patch.endsAt) : existing.endsAt;
  assertDates(startsAt, endsAt);
  if (nextStatus === "scheduled" && !startsAt) throw new Error("Scheduled campaigns require a start date");
  const couponId = patch.couponId !== undefined
    ? (patch.couponId == null || patch.couponId === 0 ? null : Number(patch.couponId))
    : existing.couponId;
  await assertCouponOwned(existing.storeId, couponId);
  const campaignType = patch.campaignType != null ? patch.campaignType : existing.campaignType;

  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const idx = ms.campaigns.findIndex((c) => c.id === campaignId);
    if (idx < 0) throw new Error("Campaign not found");
    const prev = ms.campaigns[idx]!;
    const updated = { ...prev, name, description, campaignType, status: nextStatus, startsAt, endsAt, bannerUrl, announcementText, couponId, updatedAt: new Date() };
    ms.campaigns[idx] = updated;
    if (patch.productIds) await setCampaignProducts(campaignId, existing.storeId, patch.productIds);
    if (prev.status !== nextStatus) await maybeNotify(existing.storeId, updated, nextStatus);
    return serialize({ ...updated, productIds: await loadProductIds(campaignId) });
  }

  const updatedRows = await getDb().update(campaigns).set({
    name, description, campaignType, status: nextStatus, startsAt, endsAt, bannerUrl, announcementText, couponId, updatedAt: new Date(),
  }).where(eq(campaigns.id, campaignId)).returning();
  const row = updatedRows[0]!;
  if (patch.productIds) await setCampaignProducts(campaignId, existing.storeId, patch.productIds);
  if (existing.status !== nextStatus) await maybeNotify(existing.storeId, row, nextStatus);
  return serialize({
    id: row.id, storeId: row.storeId, name: row.name, slug: row.slug, description: row.description,
    campaignType: row.campaignType, status: row.status, startsAt: row.startsAt, endsAt: row.endsAt,
    bannerUrl: row.bannerUrl, announcementText: row.announcementText, couponId: row.couponId,
    createdAt: row.createdAt, updatedAt: row.updatedAt, productIds: await loadProductIds(campaignId),
  });
}

export async function deleteCampaign(ownerId: number, campaignId: number): Promise<void> {
  const existing = await getCampaignOwned(ownerId, campaignId);
  if (!existing) throw new Error("Campaign not found");
  if (existing.status !== "draft") throw new Error("Only draft campaigns can be deleted");
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    ms.campaignProducts = ms.campaignProducts.filter((l) => l.campaignId !== campaignId);
    ms.campaigns = ms.campaigns.filter((c) => c.id !== campaignId);
    return;
  }
  await getDb().delete(campaignProducts).where(eq(campaignProducts.campaignId, campaignId));
  await getDb().delete(campaigns).where(eq(campaigns.id, campaignId));
}

async function getPublicCouponSummary(storeId: number, couponId: number, now: Date) {
  let c: { storeId: number; code: string; type: string; value: number; active: boolean; startsAt: Date | null; expiresAt: Date | null; usageLimit: number | null; usageCount: number } | null = null;
  if (useMemory()) c = mem.getMemoryStore().coupons.find((x) => x.id === couponId) ?? null;
  else {
    const rows = await getDb().select().from(coupons).where(eq(coupons.id, couponId)).limit(1);
    c = rows[0] ?? null;
  }
  if (!c || c.storeId !== storeId || !c.active) return null;
  if (c.startsAt && c.startsAt.getTime() > now.getTime()) return null;
  if (c.expiresAt && c.expiresAt.getTime() <= now.getTime()) return null;
  if (c.usageLimit != null && c.usageCount >= c.usageLimit) return null;
  const label = c.type === "percentage" ? `${c.value}% off` : `₦${Math.round(c.value / 100).toLocaleString("en-NG")} off`;
  return { code: c.code, label };
}

export async function listPublicCampaignsForStore(storeId: number, now = new Date()): Promise<PublicCampaign[]> {
  let rows: CampaignRow[] = [];
  if (useMemory()) rows = mem.getMemoryStore().campaigns.filter((c) => c.storeId === storeId);
  else {
    const dbRows = await getDb().select().from(campaigns).where(eq(campaigns.storeId, storeId));
    rows = dbRows.map((c) => ({
      id: c.id, storeId: c.storeId, name: c.name, slug: c.slug, description: c.description,
      campaignType: c.campaignType, status: c.status, startsAt: c.startsAt, endsAt: c.endsAt,
      bannerUrl: c.bannerUrl, announcementText: c.announcementText, couponId: c.couponId,
      createdAt: c.createdAt, updatedAt: c.updatedAt,
    }));
  }
  const out: PublicCampaign[] = [];
  for (const c of rows) {
    if (!isCampaignPubliclyVisible(c, now)) continue;
    const productIds = await loadProductIds(c.id);
    let couponCode: string | null = null, couponLabel: string | null = null;
    if (c.couponId) {
      const coupon = await getPublicCouponSummary(storeId, c.couponId, now);
      if (coupon) { couponCode = coupon.code; couponLabel = coupon.label; }
    }
    out.push({
      id: c.id, name: c.name, slug: c.slug, description: c.description, campaignType: c.campaignType,
      bannerUrl: c.bannerUrl, announcementText: c.announcementText,
      startsAt: c.startsAt ? c.startsAt.toISOString() : null, endsAt: c.endsAt ? c.endsAt.toISOString() : null,
      couponCode, couponLabel, productIds,
    });
  }
  return out;
}

export async function getPublicCampaignBySlugs(storeSlug: string, campaignSlug: string, now = new Date()) {
  let store: { id: number; name: string; slug: string; logoUrl: string | null; bannerUrl: string | null; description: string } | null = null;
  if (useMemory()) {
    const s = mem.memGetStoreBySlug(storeSlug);
    if (!s) return null;
    store = { id: s.id, name: s.name, slug: s.slug, logoUrl: s.logoUrl, bannerUrl: s.bannerUrl, description: s.description };
  } else {
    const rows = await getDb().select().from(stores).where(eq(stores.slug, storeSlug)).limit(1);
    const s = rows[0];
    if (!s) return null;
    store = { id: s.id, name: s.name, slug: s.slug, logoUrl: s.logoUrl, bannerUrl: s.bannerUrl, description: s.description };
  }

  let campaign: CampaignRow | null = null;
  if (useMemory()) {
    campaign = mem.getMemoryStore().campaigns.find((c) => c.storeId === store!.id && c.slug === campaignSlug) ?? null;
  } else {
    const rows = await getDb().select().from(campaigns).where(and(eq(campaigns.storeId, store.id), eq(campaigns.slug, campaignSlug))).limit(1);
    const c = rows[0];
    if (c) {
      campaign = {
        id: c.id, storeId: c.storeId, name: c.name, slug: c.slug, description: c.description,
        campaignType: c.campaignType, status: c.status, startsAt: c.startsAt, endsAt: c.endsAt,
        bannerUrl: c.bannerUrl, announcementText: c.announcementText, couponId: c.couponId,
        createdAt: c.createdAt, updatedAt: c.updatedAt,
      };
    }
  }

  if (!campaign) return { store, campaign: null, expired: false, products: [] as Array<{ id: number; name: string; slug: string; priceKobo: number; imageUrl: string | null; category: string; stock: number; featured: boolean }> };

  const visible = isCampaignPubliclyVisible(campaign, now);
  const expired = !visible && (effectiveCampaignStatus(campaign, now) === "expired" || campaign.status === "expired");
  if (!visible && !expired && campaign.status !== "active") return { store, campaign: null, expired: false, products: [] };

  const productIds = await loadProductIds(campaign.id);
  let couponCode: string | null = null, couponLabel: string | null = null;
  if (campaign.couponId) {
    const coupon = await getPublicCouponSummary(store.id, campaign.couponId, now);
    if (coupon) { couponCode = coupon.code; couponLabel = coupon.label; }
  }
  const publicCampaign: PublicCampaign = {
    id: campaign.id, name: campaign.name, slug: campaign.slug, description: campaign.description,
    campaignType: campaign.campaignType, bannerUrl: campaign.bannerUrl, announcementText: campaign.announcementText,
    startsAt: campaign.startsAt ? campaign.startsAt.toISOString() : null,
    endsAt: campaign.endsAt ? campaign.endsAt.toISOString() : null,
    couponCode, couponLabel, productIds,
  };

  let productRows = useMemory()
    ? mem.getMemoryStore().products.filter((p) => p.storeId === store!.id)
    : await getDb().select().from(products).where(eq(products.storeId, store.id));
  let selected = productRows.filter((p) => p.active);
  if (productIds.length > 0) {
    const set = new Set(productIds);
    selected = selected.filter((p) => set.has(p.id));
  } else if (["featured_products", "seasonal_sale", "limited_offer"].includes(campaign.campaignType)) {
    const featured = selected.filter((p) => p.featured);
    if (featured.length > 0) selected = featured;
  }

  return {
    store,
    campaign: visible || expired ? publicCampaign : null,
    expired,
    products: selected.map((p) => ({
      id: p.id, name: p.name, slug: p.slug, priceKobo: p.priceKobo, imageUrl: p.imageUrl,
      category: p.category || "General", stock: p.stock, featured: Boolean(p.featured),
    })),
  };
}
