import { NextResponse } from "next/server";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { getWalletSummary } from "@/lib/server/wallet";
export async function GET() {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  try {
    return NextResponse.json({ storeId: resolved.primary.id, ...(await getWalletSummary(resolved.primary.id, resolved.session.userId)) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
