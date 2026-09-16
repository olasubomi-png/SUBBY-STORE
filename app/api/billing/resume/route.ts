import { mapBillingError } from "@/lib/server/billing-errors";
import { NextResponse } from "next/server";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { resumeSubscription } from "@/lib/server/subscriptions";

export async function POST() {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }
  try {
    const result = await resumeSubscription({
      ownerId: resolved.session.userId,
      storeId: resolved.primary.id,
    });
    const sub = result.subscription;
    return NextResponse.json({
      status: sub.status,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      providerOk: result.providerOk,
      providerError: result.providerError,
      message: !result.localUpdated
        ? "Subscription was already active."
        : result.providerOk
          ? "Subscription resumed. Automatic renewal is on."
          : "Resumed locally, but Paystack could not re-enable automatic renewal. You may need to upgrade again before the period ends.",
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Resume failed" },
      { status: 400 }
    );
  }
}
