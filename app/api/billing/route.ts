import { mapBillingError } from "@/lib/server/billing-errors";
import { NextResponse } from "next/server";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { getBillingSummary } from "@/lib/server/subscriptions";

export async function GET() {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  try {
    const summary = await getBillingSummary(resolved.primary.id);
    return NextResponse.json({ storeId: resolved.primary.id, storeSlug: resolved.primary.slug, ...summary });
  } catch (e) {
    const mapped = mapBillingError(e); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
