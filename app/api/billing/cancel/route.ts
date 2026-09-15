import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { cancelSubscription } from "@/lib/server/subscriptions";

const schema = z.object({ immediate: z.boolean().optional() });

export async function POST(req: Request) {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  let body: unknown = {};
  try { body = await req.json(); } catch { body = {}; }
  const parsed = schema.safeParse(body);
  try {
    const sub = await cancelSubscription({
      ownerId: resolved.session.userId, storeId: resolved.primary.id,
      immediate: parsed.success ? parsed.data.immediate : false,
    });
    return NextResponse.json({
      status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      currentPeriodEnd: sub.currentPeriodEnd ? sub.currentPeriodEnd.toISOString() : null,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Cancel failed" }, { status: 400 });
  }
}
