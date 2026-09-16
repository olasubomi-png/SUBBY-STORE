import { mapBillingError } from "@/lib/server/billing-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { verifyAndConfirmSubscriptionReference } from "@/lib/server/subscriptions";

const schema = z.object({ reference: z.string().min(4).max(120) });

export async function POST(req: Request) {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid reference" }, { status: 400 });
  try {
    const result = await verifyAndConfirmSubscriptionReference(parsed.data.reference);
    return NextResponse.json({
      alreadyProcessed: result.alreadyProcessed, plan: result.plan.slug, status: result.subscription.status,
    });
  } catch (e) {
    const mapped = mapBillingError(e); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
