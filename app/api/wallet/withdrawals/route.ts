import { NextResponse } from "next/server";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { listWithdrawals } from "@/lib/server/wallet";
export async function GET() {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  try {
    const rows = await listWithdrawals(resolved.primary.id, resolved.session.userId, 50);
    return NextResponse.json({ withdrawals: rows.map((w) => ({ id: w.id, amountKobo: w.amountKobo, status: w.status, reference: w.reference, failureReason: w.failureReason, createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : String(w.createdAt) })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
