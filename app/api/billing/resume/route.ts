import { NextResponse } from "next/server";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { resumeSubscription } from "@/lib/server/subscriptions";

export async function POST() {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  try {
    const sub = await resumeSubscription({
      ownerId: resolved.session.userId, storeId: resolved.primary.id,
    });
    return NextResponse.json({ status: sub.status, cancelAtPeriodEnd: sub.cancelAtPeriodEnd });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Resume failed" }, { status: 400 });
  }
}
