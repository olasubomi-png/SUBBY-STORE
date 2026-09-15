import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { requestWithdrawal } from "@/lib/server/wallet";
const schema = z.object({ amountKobo: z.number().int().positive(), idempotencyKey: z.string().min(8).max(80).optional() });
export async function POST(req: Request) {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  try {
    const result = await requestWithdrawal({ ownerId: resolved.session.userId, storeId: resolved.primary.id, amountKobo: parsed.data.amountKobo, idempotencyKey: parsed.data.idempotencyKey });
    return NextResponse.json({ id: result.withdrawal.id, status: result.withdrawal.status, reference: result.withdrawal.reference, amountKobo: result.withdrawal.amountKobo, alreadyExists: result.alreadyExists, failureReason: result.withdrawal.failureReason });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Withdrawal failed" }, { status: 400 });
  }
}
