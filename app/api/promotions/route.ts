import { NextResponse } from "next/server";
import { getStoreBySlug } from "@/lib/server/repo";
import { listPublicStorePromotions } from "@/lib/server/public-promotions";

export async function GET(req: Request) {
  const slug = new URL(req.url).searchParams.get("storeSlug") || "";
  if (!slug) {
    return NextResponse.json({ error: "storeSlug required" }, { status: 400 });
  }
  const store = await getStoreBySlug(slug);
  if (!store) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const promotions = await listPublicStorePromotions(store.id);
  return NextResponse.json({ promotions });
}
