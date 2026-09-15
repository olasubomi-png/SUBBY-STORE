import { NextResponse } from "next/server";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { getWithdrawalDetail } from "@/lib/server/wallet-ops";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  try {
    const detail = await getWithdrawalDetail(resolved.primary.id, resolved.session.userId, Number(id));
    return NextResponse.json(detail);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Not found" }, { status: 404 });
  }
}
