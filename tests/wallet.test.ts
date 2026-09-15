/**
 * Phase 9.3 / 9.3.1 — seller wallet & withdrawals
 */
import { beforeEach, describe, expect, it } from "vitest";
import { resetMemoryStore, memSignup, memCreateStore } from "@/lib/server/memory-repo";
import {
  creditOrderEarning,
  debitOrderRefund,
  getWalletSummary,
  requestWithdrawal,
  completeWithdrawal,
  failWithdrawal,
  reverseWithdrawal,
  verifyAndSaveBankAccount,
  reconcileWithdrawal,
  enqueuePendingWalletCredit,
  processPendingWalletCredits,
  ensureOrderEarningCredited,
} from "@/lib/server/wallet";

process.env.USE_MEMORY_DB = "1";
process.env.PAYSTACK_MOCK = "1";

async function seed() {
  const user = await memSignup({
    email: `s${Math.random().toString(16).slice(2)}@test.local`,
    password: "password123",
    fullName: "Seller",
  });
  const shop = memCreateStore({ ownerId: user.id, name: `Shop ${user.id}` });
  return { user, shop };
}

beforeEach(() => {
  resetMemoryStore();
});

describe("earnings", () => {
  it("credits once on paid order", async () => {
    const { user, shop } = await seed();
    const r1 = await creditOrderEarning({ storeId: shop.id, orderId: 1, amountKobo: 500_000 });
    const r2 = await creditOrderEarning({ storeId: shop.id, orderId: 1, amountKobo: 500_000 });
    expect(r1.credited).toBe(true);
    expect(r2.credited).toBe(false);
    const sum = await getWalletSummary(shop.id, user.id);
    expect(sum.availableKobo).toBe(500_000);
    expect(sum.lifetimeEarnedKobo).toBe(500_000);
  });

  it("outbox recovers failed credit path", async () => {
    const { user, shop } = await seed();
    await enqueuePendingWalletCredit({
      storeId: shop.id, orderId: 77, amountKobo: 250_000, paymentReference: "ref77",
    });
    const r = await processPendingWalletCredits();
    expect(r.processed).toBeGreaterThanOrEqual(1);
    expect((await getWalletSummary(shop.id, user.id)).availableKobo).toBe(250_000);
    expect((await processPendingWalletCredits()).processed).toBe(0);
  });

  it("ensureOrderEarningCredited is idempotent", async () => {
    const { user, shop } = await seed();
    const a = await ensureOrderEarningCredited({ storeId: shop.id, orderId: 9, amountKobo: 10_000 });
    const b = await ensureOrderEarningCredited({ storeId: shop.id, orderId: 9, amountKobo: 10_000 });
    expect(a.credited).toBe(true);
    expect(b.credited).toBe(false);
    expect((await getWalletSummary(shop.id, user.id)).availableKobo).toBe(10_000);
  });
});

describe("withdrawal lifecycle", () => {
  it("normal success", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 1, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 200_000, idempotencyKey: "okpath001",
    });
    expect(withdrawal.status).toBe("processing");
    expect((await getWalletSummary(shop.id, user.id)).availableKobo).toBe(300_000);
    await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "evt_ok1" });
    const sum = await getWalletSummary(shop.id, user.id);
    expect(sum.availableKobo).toBe(300_000);
    expect(sum.lifetimeWithdrawnKobo).toBe(200_000);
  });

  it("definitive provider rejection releases hold", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 2, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 150_000, idempotencyKey: "fail_def1",
    });
    expect(withdrawal.status).toBe("failed");
    expect((await getWalletSummary(shop.id, user.id)).availableKobo).toBe(500_000);
  });

  it("ambiguous provider response keeps funds reserved", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 3, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 150_000, idempotencyKey: "timeout_amb1",
    });
    expect(withdrawal.status).toBe("provider_unknown");
    expect((await getWalletSummary(shop.id, user.id)).availableKobo).toBe(350_000);
  });

  it("reconciliation resolves provider_unknown", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 4, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "timeout_recon1",
    });
    expect(withdrawal.status).toBe("provider_unknown");
    const r = await reconcileWithdrawal(withdrawal.reference);
    expect(r.status).toBe("success");
    expect((await getWalletSummary(shop.id, user.id)).lifetimeWithdrawnKobo).toBe(100_000);
  });

  it("idempotent retry; conflict on amount", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 5, amountKobo: 800_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const a = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 200_000, idempotencyKey: "samekey99",
    });
    const b = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 200_000, idempotencyKey: "samekey99",
    });
    expect(b.alreadyExists).toBe(true);
    expect(b.withdrawal.reference).toBe(a.withdrawal.reference);
    await expect(
      requestWithdrawal({
        ownerId: user.id, storeId: shop.id, amountKobo: 300_000, idempotencyKey: "samekey99",
      })
    ).rejects.toThrow(/Idempotency key conflict/);
  });

  it("duplicate complete is no-op; success then fail rejected", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 6, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "dupcomp01",
    });
    const r1 = await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "evt_dup1" });
    const r2 = await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "evt_dup1" });
    expect(r1.alreadyProcessed).toBe(false);
    expect(r2.alreadyProcessed).toBe(true);
    await expect(failWithdrawal({ reference: withdrawal.reference })).rejects.toThrow(/cannot_fail_successful/);
  });

  it("reversal restores available once", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 8, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "revonce1",
    });
    await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "evt_rev1" });
    await reverseWithdrawal({ reference: withdrawal.reference, providerEventId: "evt_rev2" });
    const r2 = await reverseWithdrawal({ reference: withdrawal.reference, providerEventId: "evt_rev2" });
    expect(r2.alreadyProcessed).toBe(true);
    const sum = await getWalletSummary(shop.id, user.id);
    expect(sum.availableKobo).toBe(500_000);
    expect(sum.lifetimeWithdrawnKobo).toBe(0);
  });

  it("debt blocks withdrawal; future earnings reduce debt", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 20, amountKobo: 200_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 200_000, idempotencyKey: "debtblock1",
    });
    await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "evt_db1" });
    await debitOrderRefund({ storeId: shop.id, orderId: 20, amountKobo: 200_000 });
    expect((await getWalletSummary(shop.id, user.id)).debtKobo).toBe(200_000);
    await expect(
      requestWithdrawal({ ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "debtblock2" })
    ).rejects.toThrow(/debt/);
    await creditOrderEarning({ storeId: shop.id, orderId: 21, amountKobo: 150_000 });
    expect((await getWalletSummary(shop.id, user.id)).debtKobo).toBe(50_000);
    await debitOrderRefund({ storeId: shop.id, orderId: 20, amountKobo: 200_000 });
    expect((await getWalletSummary(shop.id, user.id)).debtKobo).toBe(50_000);
  });
});

describe("security", () => {
  it("isolation and debt scenario", async () => {
    const a = await seed();
    const b = await seed();
    await creditOrderEarning({ storeId: a.shop.id, orderId: 99, amountKobo: 100_000 });
    await expect(getWalletSummary(a.shop.id, b.user.id)).rejects.toThrow(/Store not found/);
    await verifyAndSaveBankAccount({
      ownerId: a.user.id, storeId: a.shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    await creditOrderEarning({ storeId: a.shop.id, orderId: 40, amountKobo: 200_000 });
    const { withdrawal } = await requestWithdrawal({
      ownerId: a.user.id, storeId: a.shop.id, amountKobo: 300_000, idempotencyKey: "debtpath1",
    });
    await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "cdebt" });
    await debitOrderRefund({ storeId: a.shop.id, orderId: 40, amountKobo: 200_000 });
    const sum = await getWalletSummary(a.shop.id, a.user.id);
    expect(sum.availableKobo).toBe(0);
    expect(sum.debtKobo).toBe(200_000);
  });
});
