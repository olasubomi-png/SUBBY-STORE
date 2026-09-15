/**
 * Phase 9.4 — durable wallet reconciliation engine.
 *
 * Safe, deterministic repairs only. Ambiguous cases are reported as findings.
 * Never creates a second Paystack transfer. Never auto-releases ambiguous holds.
 *
 * Authorization: store-owner scoped actions for a seller's own data.
 * There is no platform-wide admin role in this codebase yet — platform totals
 * are only available via internal processPending / find* helpers, not HTTP.
 */
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  pendingWalletCredits,
  sellerWallets,
  walletLedger,
  withdrawals,
  stores,
  orders,
} from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import {
  creditOrderEarning,
  processPendingWalletCredits,
  reconcileWithdrawal,
  findPaidOrdersMissingEarnings,
  findStuckWithdrawals,
  ensureWallet,
} from "@/lib/server/wallet";

export type ReconciliationFinding = {
  code: string;
  severity: "info" | "warning" | "critical";
  message: string;
  storeId?: number | null;
  orderId?: number | null;
  withdrawalId?: number | null;
  reference?: string | null;
  autoRepairable: boolean;
};

export type ReconciliationReport = {
  ranAt: string;
  storeId: number | null;
  findings: ReconciliationFinding[];
  pendingCreditsProcessed: number;
  withdrawalsVerified: number;
  repairsApplied: number;
};

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

/** Detect duplicate order_earning keys for a store (memory + SQL). */
async function findDuplicateEarnings(storeId?: number | null): Promise<ReconciliationFinding[]> {
  const findings: ReconciliationFinding[] = [];
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    const counts = new Map<number, number>();
    for (const e of ms.walletLedger) {
      if (e.entryType !== "order_earning" || e.orderId == null) continue;
      if (storeId != null && e.storeId !== storeId) continue;
      counts.set(e.orderId, (counts.get(e.orderId) || 0) + 1);
    }
    for (const [orderId, n] of counts) {
      if (n > 1) {
        findings.push({
          code: "duplicate_earning",
          severity: "critical",
          message: `Order ${orderId} has ${n} order_earning ledger rows`,
          orderId,
          autoRepairable: false,
        });
      }
    }
    return findings;
  }
  // SQL path: count per order_id
  const result = await getDb().execute(sql`
    SELECT order_id AS "orderId", store_id AS "storeId", COUNT(*)::int AS n
    FROM wallet_ledger
    WHERE entry_type = 'order_earning' AND order_id IS NOT NULL
      ${storeId != null ? sql`AND store_id = ${storeId}` : sql``}
    GROUP BY order_id, store_id
    HAVING COUNT(*) > 1
    LIMIT 50
  `);
  const rows = ((result as { rows?: unknown[] }).rows ?? result) as Array<{
    orderId: number;
    storeId: number;
    n: number;
  }>;
  for (const r of rows) {
    findings.push({
      code: "duplicate_earning",
      severity: "critical",
      message: `Order ${r.orderId} has ${r.n} order_earning ledger rows`,
      storeId: r.storeId,
      orderId: r.orderId,
      autoRepairable: false,
    });
  }
  return findings;
}

async function findWithdrawalsMissingHold(storeId?: number | null): Promise<ReconciliationFinding[]> {
  const findings: ReconciliationFinding[] = [];
  if (useMemory()) {
    const ms = mem.getMemoryStore();
    for (const w of ms.withdrawals) {
      if (storeId != null && w.storeId !== storeId) continue;
      const hold = ms.walletLedger.some(
        (e) => e.withdrawalId === w.id && e.entryType === "withdrawal_hold"
      );
      if (!hold) {
        findings.push({
          code: "withdrawal_missing_hold",
          severity: "critical",
          message: `Withdrawal ${w.reference} has no withdrawal_hold ledger entry`,
          storeId: w.storeId,
          withdrawalId: w.id,
          reference: w.reference,
          autoRepairable: false,
        });
      }
    }
    return findings;
  }
  return findings;
}

/**
 * Run reconciliation for a seller's store.
 * - Processes pending wallet credits (idempotent)
 * - Verifies provider_unknown / stuck processing withdrawals via Paystack
 * - Collects findings for missing earnings, duplicates, ledger gaps
 */
export async function runStoreReconciliation(input: {
  storeId: number;
  ownerId: number;
  verifyStuckMinutes?: number;
}): Promise<ReconciliationReport> {
  await assertStoreOwned(input.storeId, input.ownerId);
  const findings: ReconciliationFinding[] = [];
  let pendingCreditsProcessed = 0;
  let withdrawalsVerified = 0;
  let repairsApplied = 0;

  // A. Pending credits
  const creditResult = await processPendingWalletCredits(50);
  pendingCreditsProcessed = creditResult.processed;
  repairsApplied += creditResult.processed;
  if (creditResult.failed > 0) {
    findings.push({
      code: "pending_credit_failed",
      severity: "warning",
      message: `${creditResult.failed} pending wallet credit(s) still failing`,
      storeId: input.storeId,
      autoRepairable: true,
    });
  }

  // B + C. Provider-unknown / stuck processing
  const stuck = await findStuckWithdrawals(input.verifyStuckMinutes ?? 0, 50);
  const storeStuck = (stuck as Array<{ storeId: number; reference: string; status: string }>).filter(
    (w) => w.storeId === input.storeId
  );
  // Also include all provider_unknown for this store regardless of age
  let unknownRefs: string[] = [];
  if (useMemory()) {
    unknownRefs = mem
      .getMemoryStore()
      .withdrawals.filter(
        (w) =>
          w.storeId === input.storeId &&
          (w.status === "provider_unknown" || w.status === "processing")
      )
      .map((w) => w.reference);
  } else {
    const rows = await getDb()
      .select({ reference: withdrawals.reference })
      .from(withdrawals)
      .where(
        and(
          eq(withdrawals.storeId, input.storeId),
          sql`${withdrawals.status} IN ('provider_unknown', 'processing')`
        )
      )
      .limit(50);
    unknownRefs = rows.map((r) => r.reference);
  }
  const refs = Array.from(new Set([...unknownRefs, ...storeStuck.map((s) => s.reference)]));
  for (const reference of refs) {
    try {
      const r = await reconcileWithdrawal(reference);
      withdrawalsVerified += 1;
      if (!r.alreadyResolved && (r.status === "success" || r.status === "failed")) {
        repairsApplied += 1;
      } else if (r.status === "processing" || r.status === "provider_unknown") {
        findings.push({
          code: "withdrawal_still_unknown",
          severity: "info",
          message: `Withdrawal ${reference} still awaiting provider confirmation`,
          storeId: input.storeId,
          reference,
          autoRepairable: true,
        });
      }
    } catch (e) {
      findings.push({
        code: "withdrawal_verify_error",
        severity: "warning",
        message: e instanceof Error ? e.message : "verify failed",
        storeId: input.storeId,
        reference,
        autoRepairable: false,
      });
    }
  }

  // Missing earnings (report only)
  const missing = await findPaidOrdersMissingEarnings(50);
  for (const m of missing.filter((x) => x.storeId === input.storeId)) {
    findings.push({
      code: "missing_earning",
      severity: "critical",
      message: `Paid order ${m.orderId} has no seller earning`,
      storeId: m.storeId,
      orderId: m.orderId,
      autoRepairable: true,
    });
  }

  findings.push(...(await findDuplicateEarnings(input.storeId)));
  findings.push(...(await findWithdrawalsMissingHold(input.storeId)));

  // Debt / summary consistency (memory)
  if (useMemory()) {
    const w = await ensureWallet(input.storeId);
    if (w.debtKobo < 0) {
      findings.push({
        code: "negative_debt",
        severity: "critical",
        message: "Wallet debt is negative",
        storeId: input.storeId,
        autoRepairable: false,
      });
    }
    if (w.availableKobo < 0) {
      findings.push({
        code: "negative_available",
        severity: "critical",
        message: "Available balance is negative",
        storeId: input.storeId,
        autoRepairable: false,
      });
    }
  }

  return {
    ranAt: new Date().toISOString(),
    storeId: input.storeId,
    findings,
    pendingCreditsProcessed,
    withdrawalsVerified,
    repairsApplied,
  };
}

/**
 * Seller-owned safe action: verify one of their withdrawals still in
 * processing / provider_unknown. Never creates a second transfer.
 */
export async function sellerVerifyWithdrawal(input: {
  storeId: number;
  ownerId: number;
  reference: string;
}) {
  await assertStoreOwned(input.storeId, input.ownerId);
  if (useMemory()) {
    const wd = mem
      .getMemoryStore()
      .withdrawals.find((w) => w.reference === input.reference && w.storeId === input.storeId);
    if (!wd) throw new Error("Withdrawal not found");
  } else {
    const rows = await getDb()
      .select()
      .from(withdrawals)
      .where(
        and(eq(withdrawals.reference, input.reference), eq(withdrawals.storeId, input.storeId))
      )
      .limit(1);
    if (!rows[0]) throw new Error("Withdrawal not found");
  }
  return reconcileWithdrawal(input.reference);
}

/**
 * Attempt to credit a missing earning for a paid order owned by this seller.
 * Idempotent via order_earning:{orderId}.
 */
export async function sellerRetryMissingEarning(input: {
  storeId: number;
  ownerId: number;
  orderId: number;
  amountKobo: number;
  paymentReference?: string | null;
}) {
  await assertStoreOwned(input.storeId, input.ownerId);
  // Verify order belongs to store and is paid (memory path)
  if (useMemory()) {
    const o = mem.getMemoryStore().orders.find((x) => x.id === input.orderId);
    if (!o || o.storeId !== input.storeId) throw new Error("Order not found");
    if (o.paymentStatus !== "paid") throw new Error("Order is not paid");
  }
  return creditOrderEarning({
    storeId: input.storeId,
    orderId: input.orderId,
    amountKobo: input.amountKobo,
    paymentReference: input.paymentReference,
  });
}

/** Platform-wide scan findings (server-side only — not exposed over public HTTP). */
export async function collectPlatformFindings(limit = 50): Promise<ReconciliationFinding[]> {
  const findings: ReconciliationFinding[] = [];
  const missing = await findPaidOrdersMissingEarnings(limit);
  for (const m of missing) {
    findings.push({
      code: "missing_earning",
      severity: "critical",
      message: `Paid order ${m.orderId} has no seller earning`,
      storeId: m.storeId,
      orderId: m.orderId,
      autoRepairable: true,
    });
  }
  findings.push(...(await findDuplicateEarnings(null)));
  const stuck = await findStuckWithdrawals(60, limit);
  for (const w of stuck as Array<{ storeId: number; reference: string; status: string; id?: number }>) {
    findings.push({
      code: "stuck_withdrawal",
      severity: "warning",
      message: `Withdrawal ${w.reference} stuck in ${w.status}`,
      storeId: w.storeId,
      withdrawalId: w.id ?? null,
      reference: w.reference,
      autoRepairable: true,
    });
  }
  return findings;
}
