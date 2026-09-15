import { NextResponse } from "next/server";
import { processPendingWalletCredits, findStuckWithdrawals, reconcileWithdrawal } from "@/lib/server/wallet";
import { collectPlatformFindings } from "@/lib/server/wallet-reconciliation";

/**
 * Protected wallet reconciliation job.
 * Authorize with Authorization: Bearer $CRON_SECRET
 *
 * Safe to run repeatedly. Never creates a second Paystack transfer.
 * Does not auto-release ambiguous holds.
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json({ error: "Cron is not configured" }, { status: 503 });
  }
  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const credits = await processPendingWalletCredits(100);
    const stuck = (await findStuckWithdrawals(30, 50)) as Array<{ reference: string; status: string }>;
    let verified = 0;
    let resolved = 0;
    for (const w of stuck) {
      try {
        const r = await reconcileWithdrawal(w.reference);
        verified += 1;
        if (!r.alreadyResolved && (r.status === "success" || r.status === "failed")) {
          resolved += 1;
        }
      } catch {
        /* continue other rows */
      }
    }
    const findings = await collectPlatformFindings(50);
    return NextResponse.json({
      ok: true,
      pendingCreditsProcessed: credits.processed,
      pendingCreditsFailed: credits.failed,
      stuckChecked: stuck.length,
      verified,
      resolved,
      findingsCount: findings.length,
      criticalFindings: findings.filter((f) => f.severity === "critical").length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "reconcile_failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
