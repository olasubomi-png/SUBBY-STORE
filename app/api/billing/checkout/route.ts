import { mapBillingError } from "@/lib/server/billing-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { startSubscriptionCheckout } from "@/lib/server/subscriptions";
import { getSession } from "@/lib/server/auth";

const schema = z.object({ planSlug: z.string().min(2).max(40) });

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
  if (!parsed.success) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  const session = await getSession();
  const email = session?.email || `seller-${resolved.session.userId}@subby.store`;
  try {
    const result = await startSubscriptionCheckout({
      ownerId: resolved.session.userId, storeId: resolved.primary.id,
      planSlug: parsed.data.planSlug, email,
    });
    if (result.kind === "free") {
      return NextResponse.json({ kind: "free", plan: result.plan.slug, status: result.subscription.status });
    }
    return NextResponse.json({
      kind: "checkout", authorizationUrl: result.authorizationUrl,
      reference: result.reference, amountKobo: result.amountKobo, plan: result.plan.slug,
    });
  } catch (e) {
    const mapped = mapBillingError(e); return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
