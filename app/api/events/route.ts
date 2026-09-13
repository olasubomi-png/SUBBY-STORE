import { NextResponse } from "next/server";
import { z } from "zod";
import { getStoreBySlug } from "@/lib/server/repo";
import { recordStoreEvent } from "@/lib/server/store-events";

const ALLOWED = new Set([
  "product_view",
  "store_view",
  "add_to_cart",
  "checkout_started",
  "purchase_completed",
  "wishlist_added",
  "wishlist_removed",
  "share_product",
  "share_store",
]);

const schema = z.object({
  storeSlug: z.string().min(1).max(80),
  eventType: z.string().min(1).max(40),
  productId: z.number().int().positive().optional(),
  visitorId: z.string().max(64).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }
  if (!ALLOWED.has(parsed.data.eventType)) {
    return NextResponse.json({ error: "Unknown event" }, { status: 400 });
  }
  const store = await getStoreBySlug(parsed.data.storeSlug);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }
  try {
    await recordStoreEvent({
      storeId: store.id,
      productId: parsed.data.productId,
      eventType: parsed.data.eventType,
      visitorId: parsed.data.visitorId,
      metadata: parsed.data.metadata
        ? JSON.stringify(parsed.data.metadata).slice(0, 500)
        : null,
    });
  } catch {
    /* soft-fail */
  }
  return NextResponse.json({ ok: true });
}
