import { NextResponse } from "next/server";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { listLedger } from "@/lib/server/wallet";
export async function GET() {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  try {
    const rows = await listLedger(resolved.primary.id, resolved.session.userId, 50);
    return NextResponse.json({ transactions: rows.map((r) => ({ id: r.id, entryType: r.entryType, direction: r.direction, amountKobo: r.amountKobo, orderId: r.orderId, reference: r.reference, createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt) })) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
