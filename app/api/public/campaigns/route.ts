import { NextResponse } from "next/server";
import { getStoreBySlug } from "@/lib/server/repo";
import { listPublicCampaignsForStore } from "@/lib/server/campaigns";
export async function GET(req: Request) {
  const slug = (new URL(req.url).searchParams.get("storeSlug") || "").trim();
  if (!slug) return NextResponse.json({ error: "storeSlug required" }, { status: 400 });
  const store = await getStoreBySlug(slug);
  if (!store) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ campaigns: await listPublicCampaignsForStore(store.id) });
}
