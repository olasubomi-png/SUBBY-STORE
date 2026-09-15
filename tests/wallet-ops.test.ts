/**
 * Phase 9.4 — wallet operations & reconciliation
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resetMemoryStore, memSignup, memCreateStore } from "@/lib/server/memory-repo";
import {
  creditOrderEarning,
  requestWithdrawal,
  completeWithdrawal,
  verifyAndSaveBankAccount,
  getWalletSummary,
} from "@/lib/server/wallet";
import {
  getSellerWalletDashboard,
  listLedgerPage,
  listWithdrawalsPage,
  getWithdrawalDetail,
  withdrawalStatusLabel,
} from "@/lib/server/wallet-ops";
import {
  runStoreReconciliation,
  sellerVerifyWithdrawal,
} from "@/lib/server/wallet-reconciliation";

process.env.USE_MEMORY_DB = "1";
process.env.PAYSTACK_MOCK = "1";

async function seed() {
  const user = await memSignup({
    email: `ops${Math.random().toString(16).slice(2)}@test.local`,
    password: "password123",
    fullName: "Seller",
  });
  const shop = memCreateStore({ ownerId: user.id, name: `Shop ${user.id}` });
  return { user, shop };
}

beforeEach(() => {
  resetMemoryStore();
});

describe("wallet dashboard summary", () => {
  it("returns authoritative balances and counts", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 1, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "timeout_dash1",
    });
    const dash = await getSellerWalletDashboard(shop.id, user.id);
    expect(dash.availableKobo).toBe(400_000);
    expect(dash.lifetimeEarnedKobo).toBe(500_000);
    expect(dash.withdrawalCounts.provider_unknown).toBe(1);
    expect(dash.formatted.available).toContain("4,000");
  });

  it("isolates sellers", async () => {
    const a = await seed();
    const b = await seed();
    await creditOrderEarning({ storeId: a.shop.id, orderId: 2, amountKobo: 100_000 });
    await expect(getSellerWalletDashboard(a.shop.id, b.user.id)).rejects.toThrow(/Store not found/);
  });
});

describe("transaction history", () => {
  it("paginates ledger with descriptions", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 10, amountKobo: 50_000 });
    await creditOrderEarning({ storeId: shop.id, orderId: 11, amountKobo: 60_000 });
    const page = await listLedgerPage(shop.id, user.id, { limit: 1 });
    expect(page.transactions).toHaveLength(1);
    expect(page.transactions[0]!.description).toMatch(/Order/);
    expect(page.nextCursor).not.toBeNull();
    const page2 = await listLedgerPage(shop.id, user.id, { limit: 10, cursor: page.nextCursor });
    expect(page2.transactions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("withdrawal detail", () => {
  it("shows safe provider_unknown messaging", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 20, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "timeout_detail1",
    });
    expect(withdrawal.status).toBe("provider_unknown");
    const detail = await getWithdrawalDetail(shop.id, user.id, withdrawal.id);
    expect(detail.statusLabel).toMatch(/verification/i);
    expect(detail.failureReason).toBeNull();
    expect(detail.accountLast4).toBe("6789");
    expect(withdrawalStatusLabel("provider_unknown")).toMatch(/verification/i);
  });
});

describe("reconciliation", () => {
  it("verifies provider_unknown without second transfer", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 30, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "timeout_recon94",
    });
    const report = await runStoreReconciliation({ storeId: shop.id, ownerId: user.id });
    expect(report.withdrawalsVerified).toBeGreaterThanOrEqual(1);
    const sum = await getWalletSummary(shop.id, user.id);
    expect(sum.lifetimeWithdrawnKobo).toBe(100_000);
    // second run is idempotent
    const report2 = await runStoreReconciliation({ storeId: shop.id, ownerId: user.id });
    expect(report2.repairsApplied).toBe(0);
    const again = await sellerVerifyWithdrawal({
      storeId: shop.id, ownerId: user.id, reference: withdrawal.reference,
    });
    expect(again.alreadyResolved).toBe(true);
  });

  it("rejects cross-seller verify", async () => {
    const a = await seed();
    const b = await seed();
    await creditOrderEarning({ storeId: a.shop.id, orderId: 40, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: a.user.id, storeId: a.shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: a.user.id, storeId: a.shop.id, amountKobo: 100_000, idempotencyKey: "timeout_xsec",
    });
    await expect(
      sellerVerifyWithdrawal({ storeId: a.shop.id, ownerId: b.user.id, reference: withdrawal.reference })
    ).rejects.toThrow(/Store not found/);
  });
});
