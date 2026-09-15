/**
 * Phase 9.4 — seller-facing wallet operations (presentation + safe queries).
 * All balances come from server-side wallet state; never trust client amounts.
 */
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sellerBankAccounts, walletLedger, withdrawals, stores } from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import {
  ensureWallet,
  getWalletSummary,
  listLedger,
  listWithdrawals,
  minWithdrawalKobo,
} from "@/lib/server/wallet";
import { formatNgn } from "@/lib/money";

export type WithdrawalStatusUi =
  | "pending"
  | "processing"
  | "provider_unknown"
  | "success"
  | "failed"
  | "reversed"
  | "cancelled";

export function withdrawalStatusLabel(status: string): string {
  switch (status) {
    case "processing":
      return "Processing";
    case "provider_unknown":
      return "Provider verification in progress";
    case "success":
      return "Successful";
    case "failed":
      return "Failed — balance restored";
    case "reversed":
      return "Reversed — funds returned";
    case "pending":
      return "Pending";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function withdrawalStatusExplanation(status: string): string {
  switch (status) {
    case "processing":
      return "Your transfer has been submitted and is being confirmed.";
    case "provider_unknown":
      return "We could not confirm the provider response yet. Your funds remain reserved while we verify the transfer. This is not a failure.";
    case "success":
      return "The transfer completed successfully.";
    case "failed":
      return "The transfer failed. Your available balance has been restored.";
    case "reversed":
      return "The transfer was reversed by the provider. Funds have been returned to your wallet.";
    default:
      return "";
  }
}

export function ledgerEntryDescription(entry: {
  entryType: string;
  orderId?: number | null;
  withdrawalId?: number | null;
  reference?: string | null;
}): string {
  switch (entry.entryType) {
    case "order_earning":
      return entry.orderId ? `Order #${entry.orderId}` : "Order earning";
    case "refund_debit":
      return entry.orderId ? `Refund / debt · Order #${entry.orderId}` : "Refund / debt";
    case "withdrawal_hold":
      return "Withdrawal reserved";
    case "withdrawal_completed":
      return "Withdrawal completed";
    case "withdrawal_release":
      return "Withdrawal release (failed or reversed)";
    default:
      return entry.entryType.replace(/_/g, " ");
  }
}

async function assertStoreOwned(storeId: number, ownerId: number) {
  if (useMemory()) {
    const s = mem.getMemoryStore().stores.find((x) => x.id === storeId);
    if (!s || s.ownerId !== ownerId) throw new Error("Store not found");
    return;
  }
  const rows = await getDb()
    .select()
    .from(stores)
    .where(and(eq(stores.id, storeId), eq(stores.ownerId, ownerId)))
    .limit(1);
  if (!rows[0]) throw new Error("Store not found");
}

/** Authoritative dashboard summary including withdrawal status counts. */
export async function getSellerWalletDashboard(storeId: number, ownerId: number) {
  const summary = await getWalletSummary(storeId, ownerId);
  const wds = await listWithdrawals(storeId, ownerId, 200);
  const counts = {
    processing: 0,
    provider_unknown: 0,
    failed: 0,
    reversed: 0,
    success: 0,
  };
  for (const w of wds) {
    if (w.status in counts) {
      counts[w.status as keyof typeof counts] += 1;
    }
  }
  return {
    ...summary,
    withdrawalCounts: counts,
    formatted: {
      available: formatNgn(summary.availableKobo),
      pending: formatNgn(summary.pendingKobo),
      lifetimeEarned: formatNgn(summary.lifetimeEarnedKobo),
      lifetimeWithdrawn: formatNgn(summary.lifetimeWithdrawnKobo),
      debt: formatNgn(summary.debtKobo),
      minWithdrawal: formatNgn(summary.minWithdrawalKobo),
    },
  };
}

export async function listLedgerPage(
  storeId: number,
  ownerId: number,
  opts: { limit?: number; cursor?: number | null } = {}
) {
  await assertStoreOwned(storeId, ownerId);
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const cursor = opts.cursor ?? null;

  if (useMemory()) {
    let rows = mem
      .getMemoryStore()
      .walletLedger.filter((e) => e.storeId === storeId)
      .sort((a, b) => b.id - a.id);
    if (cursor != null) rows = rows.filter((e) => e.id < cursor);
    const page = rows.slice(0, limit);
    const nextCursor = page.length === limit ? page[page.length - 1]!.id : null;
    return {
      transactions: page.map((r) => ({
        id: r.id,
        entryType: r.entryType,
        direction: r.direction,
        amountKobo: r.amountKobo,
        orderId: r.orderId,
        withdrawalId: r.withdrawalId,
        reference: r.reference,
        description: ledgerEntryDescription(r),
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
      })),
      nextCursor,
    };
  }

  const conditions = [eq(walletLedger.storeId, storeId)];
  if (cursor != null) conditions.push(lt(walletLedger.id, cursor));
  const rows = await getDb()
    .select()
    .from(walletLedger)
    .where(and(...conditions))
    .orderBy(desc(walletLedger.id))
    .limit(limit);
  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.id : null;
  return {
    transactions: rows.map((r) => ({
      id: r.id,
      entryType: r.entryType,
      direction: r.direction,
      amountKobo: r.amountKobo,
      orderId: r.orderId,
      withdrawalId: r.withdrawalId,
      reference: r.reference,
      description: ledgerEntryDescription(r),
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
    nextCursor,
  };
}

export async function listWithdrawalsPage(
  storeId: number,
  ownerId: number,
  opts: { limit?: number; cursor?: number | null; status?: string | null } = {}
) {
  await assertStoreOwned(storeId, ownerId);
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const cursor = opts.cursor ?? null;

  let rows: Array<{
    id: number;
    amountKobo: number;
    status: string;
    reference: string;
    failureReason: string | null;
    bankAccountId: number | null;
    createdAt: Date;
    processingAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    reversedAt: Date | null;
    updatedAt: Date;
  }>;

  if (useMemory()) {
    let all = mem
      .getMemoryStore()
      .withdrawals.filter((w) => w.storeId === storeId)
      .sort((a, b) => b.id - a.id);
    if (opts.status) all = all.filter((w) => w.status === opts.status);
    if (cursor != null) all = all.filter((w) => w.id < cursor);
    rows = all.slice(0, limit) as typeof rows;
  } else {
    const conditions = [eq(withdrawals.storeId, storeId)];
    if (opts.status) conditions.push(eq(withdrawals.status, opts.status));
    if (cursor != null) conditions.push(lt(withdrawals.id, cursor));
    rows = (await getDb()
      .select()
      .from(withdrawals)
      .where(and(...conditions))
      .orderBy(desc(withdrawals.id))
      .limit(limit)) as typeof rows;
  }

  // Attach masked bank info when available
  const bankMap = new Map<number, { bankName: string; last4: string }>();
  if (useMemory()) {
    for (const b of mem.getMemoryStore().sellerBankAccounts.filter((a) => a.storeId === storeId)) {
      bankMap.set(b.id, { bankName: b.bankName, last4: b.accountNumberLast4 });
    }
  } else if (rows.some((r) => r.bankAccountId)) {
    const banks = await getDb()
      .select()
      .from(sellerBankAccounts)
      .where(eq(sellerBankAccounts.storeId, storeId));
    for (const b of banks) bankMap.set(b.id, { bankName: b.bankName, last4: b.accountNumberLast4 });
  }

  const nextCursor = rows.length === limit ? rows[rows.length - 1]!.id : null;
  return {
    withdrawals: rows.map((w) => {
      const bank = w.bankAccountId ? bankMap.get(w.bankAccountId) : null;
      return {
        id: w.id,
        amountKobo: w.amountKobo,
        status: w.status,
        statusLabel: withdrawalStatusLabel(w.status),
        statusExplanation: withdrawalStatusExplanation(w.status),
        reference: w.reference,
        failureReason:
          w.status === "provider_unknown"
            ? null
            : w.failureReason,
        bankName: bank?.bankName ?? null,
        accountLast4: bank?.last4 ?? null,
        createdAt: w.createdAt instanceof Date ? w.createdAt.toISOString() : String(w.createdAt),
        updatedAt: w.updatedAt instanceof Date ? w.updatedAt.toISOString() : String(w.updatedAt),
        completedAt: w.completedAt
          ? w.completedAt instanceof Date
            ? w.completedAt.toISOString()
            : String(w.completedAt)
          : null,
        failedAt: w.failedAt
          ? w.failedAt instanceof Date
            ? w.failedAt.toISOString()
            : String(w.failedAt)
          : null,
        reversedAt: w.reversedAt
          ? w.reversedAt instanceof Date
            ? w.reversedAt.toISOString()
            : String(w.reversedAt)
          : null,
      };
    }),
    nextCursor,
  };
}

export async function getWithdrawalDetail(
  storeId: number,
  ownerId: number,
  withdrawalId: number
) {
  await assertStoreOwned(storeId, ownerId);

  let wd: {
    id: number;
    storeId: number;
    amountKobo: number;
    status: string;
    reference: string;
    failureReason: string | null;
    bankAccountId: number | null;
    transferCode: string | null;
    createdAt: Date;
    processingAt: Date | null;
    completedAt: Date | null;
    failedAt: Date | null;
    reversedAt: Date | null;
    updatedAt: Date;
  } | null = null;

  if (useMemory()) {
    wd =
      mem.getMemoryStore().withdrawals.find((w) => w.id === withdrawalId && w.storeId === storeId) ??
      null;
  } else {
    const rows = await getDb()
      .select()
      .from(withdrawals)
      .where(and(eq(withdrawals.id, withdrawalId), eq(withdrawals.storeId, storeId)))
      .limit(1);
    wd = rows[0] ? (rows[0] as NonNullable<typeof wd>) : null;
  }
  if (!wd) throw new Error("Withdrawal not found");

  let bank: { bankName: string; last4: string; accountName: string } | null = null;
  if (wd.bankAccountId) {
    if (useMemory()) {
      const b = mem.getMemoryStore().sellerBankAccounts.find((a) => a.id === wd!.bankAccountId);
      if (b) bank = { bankName: b.bankName, last4: b.accountNumberLast4, accountName: b.accountName };
    } else {
      const rows = await getDb()
        .select()
        .from(sellerBankAccounts)
        .where(eq(sellerBankAccounts.id, wd.bankAccountId))
        .limit(1);
      if (rows[0]) {
        bank = {
          bankName: rows[0].bankName,
          last4: rows[0].accountNumberLast4,
          accountName: rows[0].accountName,
        };
      }
    }
  }

  const timeline: Array<{ label: string; at: string | null }> = [
    {
      label: "Requested",
      at: wd.createdAt instanceof Date ? wd.createdAt.toISOString() : String(wd.createdAt),
    },
    {
      label: "Funds reserved",
      at: wd.createdAt instanceof Date ? wd.createdAt.toISOString() : String(wd.createdAt),
    },
    {
      label: "Transfer submitted",
      at: wd.processingAt
        ? wd.processingAt instanceof Date
          ? wd.processingAt.toISOString()
          : String(wd.processingAt)
        : null,
    },
  ];
  if (wd.status === "provider_unknown" || wd.status === "processing") {
    timeline.push({ label: "Provider verification", at: "Pending" });
  }
  if (wd.completedAt) {
    timeline.push({
      label: "Completed",
      at: wd.completedAt instanceof Date ? wd.completedAt.toISOString() : String(wd.completedAt),
    });
  }
  if (wd.failedAt) {
    timeline.push({
      label: "Failed",
      at: wd.failedAt instanceof Date ? wd.failedAt.toISOString() : String(wd.failedAt),
    });
  }
  if (wd.reversedAt) {
    timeline.push({
      label: "Reversed",
      at: wd.reversedAt instanceof Date ? wd.reversedAt.toISOString() : String(wd.reversedAt),
    });
  }

  return {
    id: wd.id,
    amountKobo: wd.amountKobo,
    amountFormatted: formatNgn(wd.amountKobo),
    status: wd.status,
    statusLabel: withdrawalStatusLabel(wd.status),
    statusExplanation: withdrawalStatusExplanation(wd.status),
    reference: wd.reference,
    // Never expose transfer codes / secrets to seller UI beyond safe status
    failureReason: wd.status === "provider_unknown" ? null : wd.failureReason,
    bankName: bank?.bankName ?? null,
    accountLast4: bank?.last4 ?? null,
    accountName: bank?.accountName ?? null,
    timeline,
    createdAt: wd.createdAt instanceof Date ? wd.createdAt.toISOString() : String(wd.createdAt),
    updatedAt: wd.updatedAt instanceof Date ? wd.updatedAt.toISOString() : String(wd.updatedAt),
  };
}

/** Re-export min for UI convenience */
export { minWithdrawalKobo, ensureWallet };
