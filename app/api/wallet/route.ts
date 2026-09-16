import { mapWalletError } from "@/lib/server/wallet-errors";
import { NextResponse } from "next/server";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { getSellerWalletDashboard } from "@/lib/server/wallet-ops";

export async function GET() {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  try {
    const dash = await getSellerWalletDashboard(resolved.primary.id, resolved.session.userId);
    return NextResponse.json({ storeId: resolved.primary.id, ...dash });
  } catch (e) {
    const mapped = mapWalletError(e);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
