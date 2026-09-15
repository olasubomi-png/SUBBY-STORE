import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { runStoreReconciliation, sellerVerifyWithdrawal } from "@/lib/server/wallet-reconciliation";

/** Seller-scoped reconciliation for their own store only. */
export async function POST(req: Request) {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const schema = z.object({
    action: z.enum(["run", "verify_withdrawal"]).default("run"),
    reference: z.string().min(4).max(120).optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  try {
    if (parsed.data.action === "verify_withdrawal") {
      if (!parsed.data.reference) {
        return NextResponse.json({ error: "reference required" }, { status: 400 });
      }
      const result = await sellerVerifyWithdrawal({
        storeId: resolved.primary.id,
        ownerId: resolved.session.userId,
        reference: parsed.data.reference,
      });
      return NextResponse.json({ ok: true, ...result });
    }
    const report = await runStoreReconciliation({
      storeId: resolved.primary.id,
      ownerId: resolved.session.userId,
    });
    return NextResponse.json({ ok: true, report });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
