/**
 * Seller wallet ledger & withdrawals (Phase 9.3). Integer kobo only.
 */
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sellerWallets, walletLedger, sellerBankAccounts, withdrawals, stores } from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import { assertPositiveKobo } from "@/lib/money";
import {
  listPaystackBanks, resolvePaystackAccount, createPaystackTransferRecipient, initiatePaystackTransfer,
} from "@/lib/server/paystack";

export function minWithdrawalKobo(): number {
  const raw = process.env.MIN_WITHDRAWAL_KOBO?.trim();
  if (raw && /^\d+$/.test(raw)) {
    const n = Number(raw);
    if (Number.isSafeInteger(n) && n > 0) return n;
  }
  return 100_000;
}

export type WalletRow = {
  id: number; storeId: number; availableKobo: number; pendingKobo: number;
  lifetimeEarnedKobo: number; lifetimeWithdrawnKobo: number; debtKobo: number;
  createdAt: Date; updatedAt: Date;
};

async function assertStoreOwned(storeId: number, ownerId: number) {
  if (useMemory()) {
    const s = mem.getMemoryStore().stores.find((x) => x.id === storeId);
    if (!s || s.ownerId !== ownerId) throw new Error("Store not found");
    return;
  }
  const rows = await getDb().select().from(stores).where(and(eq(stores.id, storeId), eq(stores.ownerId, ownerId))).limit(1);
  if (!rows[0]) throw new Error("Store not found");
}

export async function ensureWallet(storeId: number): Promise<WalletRow> {
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    let w = ms.sellerWallets.find((x) => x.storeId === storeId);
    if (!w) {
      w = { id: ms.seq.sellerWallet++, storeId, availableKobo: 0, pendingKobo: 0, lifetimeEarnedKobo: 0, lifetimeWithdrawnKobo: 0, debtKobo: 0, createdAt: new Date(), updatedAt: new Date() };
      ms.sellerWallets.push(w);
    }
    return w;
  }
  const existing = await getDb().select().from(sellerWallets).where(eq(sellerWallets.storeId, storeId)).limit(1);
  if (existing[0]) return existing[0] as WalletRow;
  const inserted = await getDb().insert(sellerWallets).values({ storeId }).returning();
  return inserted[0] as WalletRow;
}

function ledgerExists(key: string, eventId?: string | null) {
  const ms = mem.getMemoryStore();
  if (ms.walletLedger.some((e) => e.idempotencyKey === key)) return true;
  if (eventId && ms.walletLedger.some((e) => e.providerEventId === eventId)) return true;
  return false;
}

function pushLedger(e: {
  storeId: number; walletId: number; entryType: string; direction: string; amountKobo: number;
  balanceAfterAvailableKobo: number; balanceAfterPendingKobo: number; orderId?: number | null;
  withdrawalId?: number | null; reference: string; idempotencyKey: string; providerEventId?: string | null; metadata?: string | null;
}) {
  if (ledgerExists(e.idempotencyKey, e.providerEventId)) return true;
  const ms = mem.getMemoryStore();
  ms.walletLedger.push({
    id: ms.seq.walletLedger++, storeId: e.storeId, walletId: e.walletId, entryType: e.entryType, direction: e.direction,
    amountKobo: e.amountKobo, balanceAfterAvailableKobo: e.balanceAfterAvailableKobo, balanceAfterPendingKobo: e.balanceAfterPendingKobo,
    orderId: e.orderId ?? null, withdrawalId: e.withdrawalId ?? null, reference: e.reference, idempotencyKey: e.idempotencyKey,
    providerEventId: e.providerEventId ?? null, metadata: e.metadata ?? null, createdAt: new Date(),
  });
  return false;
}

export async function creditOrderEarning(input: { storeId: number; orderId: number; amountKobo: number; paymentReference?: string | null }) {
  assertPositiveKobo(input.amountKobo);
  const key = `order_earning:${input.orderId}`;
  const wallet = await ensureWallet(input.storeId);
  if (useMemory()) {
    if (ledgerExists(key)) return { credited: false, wallet: mem.getMemoryStore().sellerWallets.find((w) => w.storeId === input.storeId)! };
    const ms = mem.getMemoryStore();
    const idx = ms.sellerWallets.findIndex((w) => w.id === wallet.id);
    let credit = input.amountKobo;
    let debt = ms.sellerWallets[idx]!.debtKobo;
    if (debt > 0) { const a = Math.min(debt, credit); debt -= a; credit -= a; }
    const next = { ...ms.sellerWallets[idx]!, availableKobo: ms.sellerWallets[idx]!.availableKobo + credit, lifetimeEarnedKobo: ms.sellerWallets[idx]!.lifetimeEarnedKobo + input.amountKobo, debtKobo: debt, updatedAt: new Date() };
    ms.sellerWallets[idx] = next;
    pushLedger({ storeId: input.storeId, walletId: wallet.id, entryType: "order_earning", direction: "credit", amountKobo: input.amountKobo, balanceAfterAvailableKobo: next.availableKobo, balanceAfterPendingKobo: next.pendingKobo, orderId: input.orderId, reference: input.paymentReference || `order_${input.orderId}`, idempotencyKey: key });
    return { credited: true, wallet: next };
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(walletLedger).where(eq(walletLedger.idempotencyKey, key)).limit(1);
    if (existing[0]) {
      const w = await tx.select().from(sellerWallets).where(eq(sellerWallets.storeId, input.storeId)).limit(1);
      return { credited: false, wallet: w[0] as WalletRow };
    }
    let rows = await tx.select().from(sellerWallets).where(eq(sellerWallets.storeId, input.storeId)).limit(1).for("update");
    let w = rows[0];
    if (!w) { const ins = await tx.insert(sellerWallets).values({ storeId: input.storeId }).returning(); w = ins[0]!; }
    let credit = input.amountKobo; let debt = w.debtKobo;
    if (debt > 0) { const a = Math.min(debt, credit); debt -= a; credit -= a; }
    const available = w.availableKobo + credit;
    const updated = await tx.update(sellerWallets).set({ availableKobo: available, lifetimeEarnedKobo: w.lifetimeEarnedKobo + input.amountKobo, debtKobo: debt, updatedAt: new Date() }).where(eq(sellerWallets.id, w.id)).returning();
    try {
      await tx.insert(walletLedger).values({ storeId: input.storeId, walletId: w.id, entryType: "order_earning", direction: "credit", amountKobo: input.amountKobo, balanceAfterAvailableKobo: available, balanceAfterPendingKobo: w.pendingKobo, orderId: input.orderId, reference: input.paymentReference || `order_${input.orderId}`, idempotencyKey: key });
    } catch {
      const cur = await tx.select().from(sellerWallets).where(eq(sellerWallets.storeId, input.storeId)).limit(1);
      return { credited: false, wallet: cur[0] as WalletRow };
    }
    return { credited: true, wallet: updated[0] as WalletRow };
  });
}

export async function debitOrderRefund(input: { storeId: number; orderId: number; amountKobo: number }) {
  assertPositiveKobo(input.amountKobo);
  const key = `refund_debit:${input.orderId}`;
  const wallet = await ensureWallet(input.storeId);
  if (useMemory()) {
    if (ledgerExists(key)) return { debited: false, wallet };
    const ms = mem.getMemoryStore();
    if (!ms.walletLedger.some((e) => e.entryType === "order_earning" && e.orderId === input.orderId)) return { debited: false, wallet };
    const idx = ms.sellerWallets.findIndex((w) => w.id === wallet.id);
    let avail = ms.sellerWallets[idx]!.availableKobo; let debt = ms.sellerWallets[idx]!.debtKobo;
    if (avail >= input.amountKobo) avail -= input.amountKobo; else { debt += input.amountKobo - avail; avail = 0; }
    const next = { ...ms.sellerWallets[idx]!, availableKobo: avail, debtKobo: debt, updatedAt: new Date() };
    ms.sellerWallets[idx] = next;
    pushLedger({ storeId: input.storeId, walletId: wallet.id, entryType: "refund_debit", direction: "debit", amountKobo: input.amountKobo, balanceAfterAvailableKobo: avail, balanceAfterPendingKobo: next.pendingKobo, orderId: input.orderId, reference: `refund_order_${input.orderId}`, idempotencyKey: key });
    return { debited: true, wallet: next };
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(walletLedger).where(eq(walletLedger.idempotencyKey, key)).limit(1);
    if (existing[0]) {
      const w = await tx.select().from(sellerWallets).where(eq(sellerWallets.storeId, input.storeId)).limit(1);
      return { debited: false, wallet: w[0] as WalletRow };
    }
    const earning = await tx.select().from(walletLedger).where(and(eq(walletLedger.orderId, input.orderId), eq(walletLedger.entryType, "order_earning"))).limit(1);
    if (!earning[0]) {
      const w = await tx.select().from(sellerWallets).where(eq(sellerWallets.storeId, input.storeId)).limit(1);
      return { debited: false, wallet: (w[0] as WalletRow) || wallet };
    }
    const locked = await tx.select().from(sellerWallets).where(eq(sellerWallets.storeId, input.storeId)).limit(1).for("update");
    const w = locked[0]!;
    let avail = w.availableKobo; let debt = w.debtKobo;
    if (avail >= input.amountKobo) avail -= input.amountKobo; else { debt += input.amountKobo - avail; avail = 0; }
    const updated = await tx.update(sellerWallets).set({ availableKobo: avail, debtKobo: debt, updatedAt: new Date() }).where(eq(sellerWallets.id, w.id)).returning();
    await tx.insert(walletLedger).values({ storeId: input.storeId, walletId: w.id, entryType: "refund_debit", direction: "debit", amountKobo: input.amountKobo, balanceAfterAvailableKobo: avail, balanceAfterPendingKobo: w.pendingKobo, orderId: input.orderId, reference: `refund_order_${input.orderId}`, idempotencyKey: key });
    return { debited: true, wallet: updated[0] as WalletRow };
  });
}

export async function getWalletSummary(storeId: number, ownerId: number) {
  await assertStoreOwned(storeId, ownerId);
  const w = await ensureWallet(storeId);
  return { availableKobo: w.availableKobo, pendingKobo: w.pendingKobo, lifetimeEarnedKobo: w.lifetimeEarnedKobo, lifetimeWithdrawnKobo: w.lifetimeWithdrawnKobo, debtKobo: w.debtKobo, minWithdrawalKobo: minWithdrawalKobo(), canWithdraw: w.availableKobo >= minWithdrawalKobo() && w.debtKobo === 0 };
}

export async function listLedger(storeId: number, ownerId: number, limit = 50) {
  await assertStoreOwned(storeId, ownerId);
  if (useMemory()) return mem.getMemoryStore().walletLedger.filter((e) => e.storeId === storeId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  return getDb().select().from(walletLedger).where(eq(walletLedger.storeId, storeId)).orderBy(desc(walletLedger.createdAt)).limit(limit);
}

export async function listWithdrawals(storeId: number, ownerId: number, limit = 50) {
  await assertStoreOwned(storeId, ownerId);
  if (useMemory()) return mem.getMemoryStore().withdrawals.filter((w) => w.storeId === storeId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
  return getDb().select().from(withdrawals).where(eq(withdrawals.storeId, storeId)).orderBy(desc(withdrawals.createdAt)).limit(limit);
}

export async function listBanks() { return listPaystackBanks(); }

export async function verifyAndSaveBankAccount(input: { ownerId: number; storeId: number; bankCode: string; bankName: string; accountNumber: string }) {
  await assertStoreOwned(input.storeId, input.ownerId);
  if (!/^\d{10}$/.test(input.accountNumber)) throw new Error("Account number must be 10 digits");
  const resolved = await resolvePaystackAccount({ accountNumber: input.accountNumber, bankCode: input.bankCode });
  const recipient = await createPaystackTransferRecipient({ name: resolved.accountName, accountNumber: input.accountNumber, bankCode: input.bankCode });
  const last4 = input.accountNumber.slice(-4);
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    for (const a of ms.sellerBankAccounts) if (a.storeId === input.storeId) a.active = false;
    const row = { id: ms.seq.sellerBankAccount++, storeId: input.storeId, bankCode: input.bankCode, bankName: input.bankName, accountNumberLast4: last4, accountName: resolved.accountName, recipientCode: recipient.recipientCode, active: true, createdAt: new Date(), updatedAt: new Date() };
    ms.sellerBankAccounts.push(row);
    return { id: row.id, bankCode: row.bankCode, bankName: row.bankName, accountNumberLast4: last4, accountName: row.accountName };
  }
  await getDb().update(sellerBankAccounts).set({ active: false, updatedAt: new Date() }).where(eq(sellerBankAccounts.storeId, input.storeId));
  const inserted = await getDb().insert(sellerBankAccounts).values({ storeId: input.storeId, bankCode: input.bankCode, bankName: input.bankName, accountNumberLast4: last4, accountName: resolved.accountName, recipientCode: recipient.recipientCode, active: true }).returning();
  const row = inserted[0]!;
  return { id: row.id, bankCode: row.bankCode, bankName: row.bankName, accountNumberLast4: row.accountNumberLast4, accountName: row.accountName };
}

export async function getActiveBankAccount(storeId: number, ownerId: number) {
  await assertStoreOwned(storeId, ownerId);
  if (useMemory()) return mem.getMemoryStore().sellerBankAccounts.find((a) => a.storeId === storeId && a.active) ?? null;
  const rows = await getDb().select().from(sellerBankAccounts).where(and(eq(sellerBankAccounts.storeId, storeId), eq(sellerBankAccounts.active, true))).limit(1);
  return rows[0] ?? null;
}

async function releaseHoldMem(storeId: number, withdrawalId: number, reference: string, amountKobo: number, reason: string) {
  const key = `withdrawal_release:${reference}`;
  if (ledgerExists(key)) return;
  const ms = mem.getMemoryStore();
  const widx = ms.withdrawals.findIndex((w) => w.id === withdrawalId);
  if (widx >= 0) ms.withdrawals[widx] = { ...ms.withdrawals[widx]!, status: "failed", failureReason: reason, failedAt: new Date(), updatedAt: new Date() };
  const sidx = ms.sellerWallets.findIndex((w) => w.storeId === storeId);
  if (sidx >= 0) {
    ms.sellerWallets[sidx] = { ...ms.sellerWallets[sidx]!, availableKobo: ms.sellerWallets[sidx]!.availableKobo + amountKobo, updatedAt: new Date() };
    pushLedger({ storeId, walletId: ms.sellerWallets[sidx]!.id, entryType: "withdrawal_release", direction: "credit", amountKobo, balanceAfterAvailableKobo: ms.sellerWallets[sidx]!.availableKobo, balanceAfterPendingKobo: ms.sellerWallets[sidx]!.pendingKobo, withdrawalId, reference: `${reference}_release`, idempotencyKey: key });
  }
}

export async function requestWithdrawal(input: { ownerId: number; storeId: number; amountKobo: number; idempotencyKey?: string | null }) {
  await assertStoreOwned(input.storeId, input.ownerId);
  assertPositiveKobo(input.amountKobo);
  const min = minWithdrawalKobo();
  if (input.amountKobo < min) throw new Error(`Minimum withdrawal is ${min} kobo`);
  const bank = await getActiveBankAccount(input.storeId, input.ownerId);
  if (!bank) throw new Error("Add and verify a bank account first");
  const wallet = await ensureWallet(input.storeId);
  if (wallet.debtKobo > 0) throw new Error("Cannot withdraw while wallet has outstanding debt");
  if (wallet.availableKobo < input.amountKobo) throw new Error("Insufficient available balance");
  const reference = input.idempotencyKey && /^[a-zA-Z0-9_-]{8,80}$/.test(input.idempotencyKey)
    ? `wd_${input.storeId}_${input.idempotencyKey}`
    : `wd_${input.storeId}_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 10)}`;
  const feeKobo = 0; const netKobo = input.amountKobo - feeKobo;

  if (useMemory()) {
    const ms = mem.getMemoryStore();
    if (ms.withdrawals.some((w) => w.reference === reference)) {
      return { withdrawal: ms.withdrawals.find((w) => w.reference === reference)!, alreadyExists: true as const };
    }
    const idx = ms.sellerWallets.findIndex((w) => w.id === wallet.id);
    if (ms.sellerWallets[idx]!.availableKobo < input.amountKobo) throw new Error("Insufficient available balance");
    const nextAvail = ms.sellerWallets[idx]!.availableKobo - input.amountKobo;
    ms.sellerWallets[idx] = { ...ms.sellerWallets[idx]!, availableKobo: nextAvail, updatedAt: new Date() };
    const wd = { id: ms.seq.withdrawal++, storeId: input.storeId, walletId: wallet.id, bankAccountId: bank.id, amountKobo: input.amountKobo, feeKobo, netKobo, status: "processing", reference, transferCode: null as string | null, recipientCode: bank.recipientCode, failureReason: null as string | null, providerEventId: null as string | null, createdAt: new Date(), processingAt: new Date(), completedAt: null as Date | null, failedAt: null as Date | null, reversedAt: null as Date | null, updatedAt: new Date() };
    ms.withdrawals.push(wd);
    pushLedger({ storeId: input.storeId, walletId: wallet.id, entryType: "withdrawal_hold", direction: "debit", amountKobo: input.amountKobo, balanceAfterAvailableKobo: nextAvail, balanceAfterPendingKobo: ms.sellerWallets[idx]!.pendingKobo, withdrawalId: wd.id, reference, idempotencyKey: `withdrawal_hold:${reference}` });
    try {
      const tr = await initiatePaystackTransfer({ amountKobo: netKobo, recipientCode: bank.recipientCode, reference, reason: `SUBBY withdrawal ${reference}` });
      const widx = ms.withdrawals.findIndex((w) => w.id === wd.id);
      ms.withdrawals[widx] = { ...ms.withdrawals[widx]!, transferCode: tr.transferCode, status: "processing", updatedAt: new Date() };
      return { withdrawal: ms.withdrawals[widx]!, alreadyExists: false as const };
    } catch (e) {
      await releaseHoldMem(input.storeId, wd.id, reference, input.amountKobo, e instanceof Error ? e.message : "Transfer failed");
      return { withdrawal: ms.withdrawals.find((w) => w.id === wd.id)!, alreadyExists: false as const };
    }
  }

  const db = getDb();
  const reserved = await db.transaction(async (tx) => {
    const existing = await tx.select().from(withdrawals).where(eq(withdrawals.reference, reference)).limit(1);
    if (existing[0]) return { already: true as const, withdrawal: existing[0] };
    const locked = await tx.select().from(sellerWallets).where(eq(sellerWallets.storeId, input.storeId)).limit(1).for("update");
    const w = locked[0];
    if (!w || w.availableKobo < input.amountKobo) throw new Error("Insufficient available balance");
    if (w.debtKobo > 0) throw new Error("Cannot withdraw while wallet has outstanding debt");
    const nextAvail = w.availableKobo - input.amountKobo;
    await tx.update(sellerWallets).set({ availableKobo: nextAvail, updatedAt: new Date() }).where(eq(sellerWallets.id, w.id));
    const ins = await tx.insert(withdrawals).values({ storeId: input.storeId, walletId: w.id, bankAccountId: bank.id, amountKobo: input.amountKobo, feeKobo, netKobo, status: "processing", reference, recipientCode: bank.recipientCode, processingAt: new Date() }).returning();
    await tx.insert(walletLedger).values({ storeId: input.storeId, walletId: w.id, entryType: "withdrawal_hold", direction: "debit", amountKobo: input.amountKobo, balanceAfterAvailableKobo: nextAvail, balanceAfterPendingKobo: w.pendingKobo, withdrawalId: ins[0]!.id, reference, idempotencyKey: `withdrawal_hold:${reference}` });
    return { already: false as const, withdrawal: ins[0]! };
  });
  if (reserved.already) return { withdrawal: reserved.withdrawal, alreadyExists: true as const };
  try {
    const tr = await initiatePaystackTransfer({ amountKobo: netKobo, recipientCode: bank.recipientCode, reference, reason: `SUBBY withdrawal ${reference}` });
    const updated = await getDb().update(withdrawals).set({ transferCode: tr.transferCode, status: "processing", updatedAt: new Date() }).where(eq(withdrawals.id, reserved.withdrawal.id)).returning();
    return { withdrawal: updated[0]!, alreadyExists: false as const };
  } catch (e) {
    await failWithdrawal({ reference, reason: e instanceof Error ? e.message : "Transfer failed" });
    const failed = await getDb().select().from(withdrawals).where(eq(withdrawals.id, reserved.withdrawal.id)).limit(1);
    return { withdrawal: failed[0]!, alreadyExists: false as const };
  }
}

export async function completeWithdrawal(input: { reference: string; transferCode?: string | null; providerEventId?: string | null }) {
  if (useMemory()) {
    if (input.providerEventId && ledgerExists("x", input.providerEventId)) {
      const wd = mem.getMemoryStore().withdrawals.find((w) => w.reference === input.reference);
      return { alreadyProcessed: true, withdrawal: wd ?? null };
    }
    const ms = mem.getMemoryStore();
    const widx = ms.withdrawals.findIndex((w) => w.reference === input.reference);
    if (widx < 0) throw new Error("withdrawal_not_found");
    if (ms.withdrawals[widx]!.status === "success") return { alreadyProcessed: true, withdrawal: ms.withdrawals[widx]! };
    if (ms.withdrawals[widx]!.status === "failed") throw new Error("cannot_complete_failed_withdrawal");
    const amount = ms.withdrawals[widx]!.amountKobo;
    ms.withdrawals[widx] = { ...ms.withdrawals[widx]!, status: "success", transferCode: input.transferCode || ms.withdrawals[widx]!.transferCode, completedAt: new Date(), providerEventId: input.providerEventId ?? null, updatedAt: new Date() };
    const sidx = ms.sellerWallets.findIndex((w) => w.storeId === ms.withdrawals[widx]!.storeId);
    ms.sellerWallets[sidx] = { ...ms.sellerWallets[sidx]!, lifetimeWithdrawnKobo: ms.sellerWallets[sidx]!.lifetimeWithdrawnKobo + amount, updatedAt: new Date() };
    pushLedger({ storeId: ms.withdrawals[widx]!.storeId, walletId: ms.withdrawals[widx]!.walletId, entryType: "withdrawal_completed", direction: "debit", amountKobo: amount, balanceAfterAvailableKobo: ms.sellerWallets[sidx]!.availableKobo, balanceAfterPendingKobo: ms.sellerWallets[sidx]!.pendingKobo, withdrawalId: ms.withdrawals[widx]!.id, reference: input.reference, idempotencyKey: `withdrawal_completed:${input.reference}`, providerEventId: input.providerEventId });
    return { alreadyProcessed: false, withdrawal: ms.withdrawals[widx]! };
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    if (input.providerEventId) {
      const byEvt = await tx.select().from(walletLedger).where(eq(walletLedger.providerEventId, input.providerEventId)).limit(1);
      if (byEvt[0]) {
        const wd = await tx.select().from(withdrawals).where(eq(withdrawals.reference, input.reference)).limit(1);
        return { alreadyProcessed: true, withdrawal: wd[0] ?? null };
      }
    }
    const rows = await tx.select().from(withdrawals).where(eq(withdrawals.reference, input.reference)).limit(1).for("update");
    const wd = rows[0];
    if (!wd) throw new Error("withdrawal_not_found");
    if (wd.status === "success") return { alreadyProcessed: true, withdrawal: wd };
    if (wd.status === "failed") throw new Error("cannot_complete_failed_withdrawal");
    await tx.update(withdrawals).set({ status: "success", transferCode: input.transferCode || wd.transferCode, completedAt: new Date(), providerEventId: input.providerEventId ?? null, updatedAt: new Date() }).where(eq(withdrawals.id, wd.id));
    const locked = await tx.select().from(sellerWallets).where(eq(sellerWallets.id, wd.walletId)).limit(1).for("update");
    const w = locked[0]!;
    await tx.update(sellerWallets).set({ lifetimeWithdrawnKobo: w.lifetimeWithdrawnKobo + wd.amountKobo, updatedAt: new Date() }).where(eq(sellerWallets.id, w.id));
    try {
      await tx.insert(walletLedger).values({ storeId: wd.storeId, walletId: wd.walletId, entryType: "withdrawal_completed", direction: "debit", amountKobo: wd.amountKobo, balanceAfterAvailableKobo: w.availableKobo, balanceAfterPendingKobo: w.pendingKobo, withdrawalId: wd.id, reference: input.reference, idempotencyKey: `withdrawal_completed:${input.reference}`, providerEventId: input.providerEventId ?? null });
    } catch { return { alreadyProcessed: true, withdrawal: wd }; }
    const updated = await tx.select().from(withdrawals).where(eq(withdrawals.id, wd.id)).limit(1);
    return { alreadyProcessed: false, withdrawal: updated[0]! };
  });
}

export async function failWithdrawal(input: { reference: string; reason?: string | null; providerEventId?: string | null }) {
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const wd = ms.withdrawals.find((w) => w.reference === input.reference);
    if (!wd) throw new Error("withdrawal_not_found");
    if (wd.status === "failed") return { alreadyProcessed: true, withdrawal: wd };
    if (wd.status === "success") throw new Error("cannot_fail_successful_withdrawal");
    await releaseHoldMem(wd.storeId, wd.id, input.reference, wd.amountKobo, input.reason || "Transfer failed");
    return { alreadyProcessed: false, withdrawal: ms.withdrawals.find((w) => w.id === wd.id)! };
  }
  const rows = await getDb().select().from(withdrawals).where(eq(withdrawals.reference, input.reference)).limit(1);
  const wd = rows[0];
  if (!wd) throw new Error("withdrawal_not_found");
  if (wd.status === "failed") return { alreadyProcessed: true, withdrawal: wd };
  if (wd.status === "success") throw new Error("cannot_fail_successful_withdrawal");
  const key = `withdrawal_release:${input.reference}`;
  await getDb().transaction(async (tx) => {
    const existing = await tx.select().from(walletLedger).where(eq(walletLedger.idempotencyKey, key)).limit(1);
    if (existing[0]) return;
    await tx.update(withdrawals).set({ status: "failed", failureReason: input.reason || "Transfer failed", failedAt: new Date(), updatedAt: new Date() }).where(eq(withdrawals.id, wd.id));
    const locked = await tx.select().from(sellerWallets).where(eq(sellerWallets.storeId, wd.storeId)).limit(1).for("update");
    const w = locked[0]!;
    const nextAvail = w.availableKobo + wd.amountKobo;
    await tx.update(sellerWallets).set({ availableKobo: nextAvail, updatedAt: new Date() }).where(eq(sellerWallets.id, w.id));
    await tx.insert(walletLedger).values({ storeId: wd.storeId, walletId: w.id, entryType: "withdrawal_release", direction: "credit", amountKobo: wd.amountKobo, balanceAfterAvailableKobo: nextAvail, balanceAfterPendingKobo: w.pendingKobo, withdrawalId: wd.id, reference: `${input.reference}_release`, idempotencyKey: key, providerEventId: input.providerEventId ?? null });
  });
  const updated = await getDb().select().from(withdrawals).where(eq(withdrawals.id, wd.id)).limit(1);
  return { alreadyProcessed: false, withdrawal: updated[0]! };
}

export async function reverseWithdrawal(input: { reference: string; providerEventId?: string | null }) {
  const key = `withdrawal_reversed:${input.reference}`;
  if (useMemory()) {
    if (ledgerExists(key)) {
      const wd = mem.getMemoryStore().withdrawals.find((w) => w.reference === input.reference);
      return { alreadyProcessed: true, withdrawal: wd ?? null };
    }
    const ms = mem.getMemoryStore();
    const widx = ms.withdrawals.findIndex((w) => w.reference === input.reference);
    if (widx < 0) throw new Error("withdrawal_not_found");
    if (ms.withdrawals[widx]!.status === "reversed") return { alreadyProcessed: true, withdrawal: ms.withdrawals[widx]! };
    if (ms.withdrawals[widx]!.status !== "success") throw new Error("can_only_reverse_success");
    const amount = ms.withdrawals[widx]!.amountKobo;
    ms.withdrawals[widx] = { ...ms.withdrawals[widx]!, status: "reversed", reversedAt: new Date(), updatedAt: new Date() };
    const sidx = ms.sellerWallets.findIndex((w) => w.storeId === ms.withdrawals[widx]!.storeId);
    ms.sellerWallets[sidx] = { ...ms.sellerWallets[sidx]!, availableKobo: ms.sellerWallets[sidx]!.availableKobo + amount, lifetimeWithdrawnKobo: Math.max(0, ms.sellerWallets[sidx]!.lifetimeWithdrawnKobo - amount), updatedAt: new Date() };
    pushLedger({ storeId: ms.withdrawals[widx]!.storeId, walletId: ms.withdrawals[widx]!.walletId, entryType: "withdrawal_release", direction: "credit", amountKobo: amount, balanceAfterAvailableKobo: ms.sellerWallets[sidx]!.availableKobo, balanceAfterPendingKobo: ms.sellerWallets[sidx]!.pendingKobo, withdrawalId: ms.withdrawals[widx]!.id, reference: `${input.reference}_reversed`, idempotencyKey: key, providerEventId: input.providerEventId });
    return { alreadyProcessed: false, withdrawal: ms.withdrawals[widx]! };
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const existing = await tx.select().from(walletLedger).where(eq(walletLedger.idempotencyKey, key)).limit(1);
    if (existing[0]) {
      const wd = await tx.select().from(withdrawals).where(eq(withdrawals.reference, input.reference)).limit(1);
      return { alreadyProcessed: true, withdrawal: wd[0] ?? null };
    }
    const rows = await tx.select().from(withdrawals).where(eq(withdrawals.reference, input.reference)).limit(1).for("update");
    const wd = rows[0];
    if (!wd) throw new Error("withdrawal_not_found");
    if (wd.status === "reversed") return { alreadyProcessed: true, withdrawal: wd };
    if (wd.status !== "success") throw new Error("can_only_reverse_success");
    await tx.update(withdrawals).set({ status: "reversed", reversedAt: new Date(), updatedAt: new Date() }).where(eq(withdrawals.id, wd.id));
    const locked = await tx.select().from(sellerWallets).where(eq(sellerWallets.id, wd.walletId)).limit(1).for("update");
    const w = locked[0]!;
    const nextAvail = w.availableKobo + wd.amountKobo;
    await tx.update(sellerWallets).set({ availableKobo: nextAvail, lifetimeWithdrawnKobo: Math.max(0, w.lifetimeWithdrawnKobo - wd.amountKobo), updatedAt: new Date() }).where(eq(sellerWallets.id, w.id));
    await tx.insert(walletLedger).values({ storeId: wd.storeId, walletId: wd.walletId, entryType: "withdrawal_release", direction: "credit", amountKobo: wd.amountKobo, balanceAfterAvailableKobo: nextAvail, balanceAfterPendingKobo: w.pendingKobo, withdrawalId: wd.id, reference: `${input.reference}_reversed`, idempotencyKey: key, providerEventId: input.providerEventId ?? null });
    const updated = await tx.select().from(withdrawals).where(eq(withdrawals.id, wd.id)).limit(1);
    return { alreadyProcessed: false, withdrawal: updated[0]! };
  });
}
