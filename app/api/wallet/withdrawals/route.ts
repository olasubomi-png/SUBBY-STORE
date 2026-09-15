import { NextResponse } from "next/server";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { listWithdrawalsPage } from "@/lib/server/wallet-ops";

export async function GET(req: Request) {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const url = new URL(req.url);
  const cursorRaw = url.searchParams.get("cursor");
  const cursor = cursorRaw && /^\d+$/.test(cursorRaw) ? Number(cursorRaw) : null;
  const status = url.searchParams.get("status");
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw && /^\d+$/.test(limitRaw) ? Number(limitRaw) : 30;
  try {
    const page = await listWithdrawalsPage(resolved.primary.id, resolved.session.userId, {
      limit,
      cursor,
      status: status || null,
    });
    return NextResponse.json(page);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
