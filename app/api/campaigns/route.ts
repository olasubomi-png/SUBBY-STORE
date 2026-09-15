import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSellerStores, parseOptionalStoreId } from "@/lib/server/store-resolve";
import { createCampaign, deleteCampaign, listCampaignsForOwner, updateCampaign } from "@/lib/server/campaigns";
import { CAMPAIGN_TYPES, CAMPAIGN_STATUSES } from "@/lib/campaigns/types";

const typeEnum = z.enum(CAMPAIGN_TYPES as unknown as [string, ...string[]]);
const statusEnum = z.enum(CAMPAIGN_STATUSES as unknown as [string, ...string[]]);
const createSchema = z.object({
  storeId: z.number().int().positive().optional(),
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional(),
  campaignType: typeEnum,
  status: statusEnum.optional(),
  startsAt: z.string().nullable().optional(),
  endsAt: z.string().nullable().optional(),
  bannerUrl: z.union([z.string().url().max(2000), z.literal(""), z.null()]).optional(),
  announcementText: z.string().max(500).nullable().optional(),
  couponId: z.number().int().positive().nullable().optional(),
  productIds: z.array(z.number().int().positive()).max(50).optional(),
  slug: z.string().max(100).optional(),
});
const patchSchema = createSchema.partial().extend({ id: z.number().int().positive() });

function serialize(c: Awaited<ReturnType<typeof listCampaignsForOwner>>[number]) {
  return {
    id: c.id, storeId: c.storeId, name: c.name, slug: c.slug, description: c.description,
    campaignType: c.campaignType, status: c.status, effectiveStatus: c.effectiveStatus,
    startsAt: c.startsAt ? c.startsAt.toISOString() : null, endsAt: c.endsAt ? c.endsAt.toISOString() : null,
    bannerUrl: c.bannerUrl, announcementText: c.announcementText, couponId: c.couponId,
    productIds: c.productIds ?? [], createdAt: c.createdAt.toISOString(), updatedAt: c.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const preferred = parseOptionalStoreId(new URL(req.url).searchParams.get("storeId"));
  const resolved = await resolveSellerStores(preferred);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  try {
    const campaigns = await listCampaignsForOwner(resolved.session.userId, resolved.primary.id);
    return NextResponse.json({ storeId: resolved.primary.id, storeSlug: resolved.primary.slug, stores: resolved.stores, campaigns: campaigns.map(serialize) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
export async function POST(req: Request) {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid" }, { status: 400 });
  const storeId = parsed.data.storeId ?? resolved.primary.id;
  if (!resolved.stores.find((s) => s.id === storeId)) return NextResponse.json({ error: "Store not found" }, { status: 404 });
  try {
    const campaign = await createCampaign(resolved.session.userId, { ...parsed.data, storeId, bannerUrl: parsed.data.bannerUrl === "" ? null : parsed.data.bannerUrl ?? null });
    return NextResponse.json({ campaign: serialize(campaign) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
export async function PATCH(req: Request) {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid" }, { status: 400 });
  try {
    const { id, ...rest } = parsed.data;
    const campaign = await updateCampaign(resolved.session.userId, id, { ...rest, bannerUrl: rest.bannerUrl === "" ? null : rest.bannerUrl });
    return NextResponse.json({ campaign: serialize(campaign) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
export async function DELETE(req: Request) {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: "Invalid campaign id" }, { status: 400 });
  try {
    await deleteCampaign(resolved.session.userId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
