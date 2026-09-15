import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { verifyAndSaveBankAccount } from "@/lib/server/wallet";
const schema = z.object({ bankCode: z.string().min(2).max(20), bankName: z.string().min(2).max(120), accountNumber: z.string().regex(/^\d{10}$/) });
export async function POST(req: Request) {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { checkRateLimit } = await import("@/lib/server/rate-limit");
  const rl = checkRateLimit(`wallet:bank:${resolved.session.userId}`, 10, 60_000);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid bank details" }, { status: 400 });
  try {
    return NextResponse.json({ account: await verifyAndSaveBankAccount({ ownerId: resolved.session.userId, storeId: resolved.primary.id, ...parsed.data }) });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Verify failed" }, { status: 400 });
  }
}
