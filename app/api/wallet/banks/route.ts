import { NextResponse } from "next/server";
import { resolveSellerStores } from "@/lib/server/store-resolve";
import { listBanks, getActiveBankAccount } from "@/lib/server/wallet";
export async function GET() {
  const resolved = await resolveSellerStores(null);
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  try {
    const banks = await listBanks();
    const active = await getActiveBankAccount(resolved.primary.id, resolved.session.userId);
    return NextResponse.json({ banks, activeAccount: active ? { id: active.id, bankCode: active.bankCode, bankName: active.bankName, accountNumberLast4: active.accountNumberLast4, accountName: active.accountName } : null });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed" }, { status: 400 });
  }
}
