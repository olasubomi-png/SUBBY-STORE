import { describe, expect, it, beforeEach } from "vitest";
import {
  canTransitionWithdrawal,
  assertWithdrawalTransition,
} from "@/lib/server/wallet-state-machine";
import { checkRateLimit, resetRateLimitsForTests } from "@/lib/server/rate-limit";
import { resetMemoryStore, memSignup, memCreateStore } from "@/lib/server/memory-repo";
import {
  creditOrderEarning,
  requestWithdrawal,
  completeWithdrawal,
  failWithdrawal,
  reverseWithdrawal,
  verifyAndSaveBankAccount,
} from "@/lib/server/wallet";

process.env.USE_MEMORY_DB = "1";
process.env.PAYSTACK_MOCK = "1";

describe("withdrawal state machine", () => {
  it("allows legal transitions", () => {
    expect(canTransitionWithdrawal("processing", "success")).toBe(true);
    expect(canTransitionWithdrawal("processing", "failed")).toBe(true);
    expect(canTransitionWithdrawal("processing", "provider_unknown")).toBe(true);
    expect(canTransitionWithdrawal("provider_unknown", "success")).toBe(true);
    expect(canTransitionWithdrawal("provider_unknown", "failed")).toBe(true);
    expect(canTransitionWithdrawal("success", "reversed")).toBe(true);
  });

  it("rejects illegal transitions", () => {
    expect(canTransitionWithdrawal("success", "failed")).toBe(false);
    expect(canTransitionWithdrawal("failed", "success")).toBe(false);
    expect(canTransitionWithdrawal("reversed", "success")).toBe(false);
    expect(canTransitionWithdrawal("failed", "reversed")).toBe(false);
    expect(() => assertWithdrawalTransition("success", "failed")).toThrow(/illegal_withdrawal_transition/);
  });
});

describe("illegal transitions at runtime", () => {
  beforeEach(() => resetMemoryStore());

  async function seedReady() {
    const user = await memSignup({
      email: `sm${Math.random().toString(16).slice(2)}@t.local`,
      password: "password123",
      fullName: "S",
    });
    const shop = memCreateStore({ ownerId: user.id, name: `S${user.id}` });
    await creditOrderEarning({ storeId: shop.id, orderId: 1, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    return { user, shop };
  }

  it("success cannot become failed", async () => {
    const { user, shop } = await seedReady();
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "smokpath1",
    });
    await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "sm1" });
    await expect(failWithdrawal({ reference: withdrawal.reference })).rejects.toThrow(/illegal_withdrawal_transition|cannot_fail/);
  });

  it("failed cannot become success", async () => {
    const { user, shop } = await seedReady();
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "fail_sm2",
    });
    expect(withdrawal.status).toBe("failed");
    await expect(completeWithdrawal({ reference: withdrawal.reference })).rejects.toThrow(/illegal_withdrawal_transition|cannot_complete/);
  });

  it("reversed is terminal", async () => {
    const { user, shop } = await seedReady();
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "revsm3",
    });
    await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "sm3" });
    await reverseWithdrawal({ reference: withdrawal.reference, providerEventId: "sm3r" });
    await expect(completeWithdrawal({ reference: withdrawal.reference })).rejects.toThrow();
    await expect(failWithdrawal({ reference: withdrawal.reference })).rejects.toThrow();
  });
});

describe("rate limit", () => {
  beforeEach(() => resetRateLimitsForTests());

  it("blocks after limit", () => {
    for (let i = 0; i < 5; i++) {
      expect(checkRateLimit("t:1", 5, 60_000).allowed).toBe(true);
    }
    expect(checkRateLimit("t:1", 5, 60_000).allowed).toBe(false);
  });
});


describe("reconciliation finders", () => {
  beforeEach(() => resetMemoryStore());

  it("findStuckWithdrawals returns processing/provider_unknown by age", async () => {
    const { findStuckWithdrawals } = await import("@/lib/server/wallet");
    const user = await memSignup({
      email: `stk${Math.random().toString(16).slice(2)}@t.local`,
      password: "password123",
      fullName: "S",
    });
    const shop = memCreateStore({ ownerId: user.id, name: `Stk${user.id}` });
    await creditOrderEarning({ storeId: shop.id, orderId: 99, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({
      ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789",
    });
    const { withdrawal } = await requestWithdrawal({
      ownerId: user.id, storeId: shop.id, amountKobo: 100_000, idempotencyKey: "timeout_stuck1",
    });
    expect(withdrawal.status).toBe("provider_unknown");
    // age 0 minutes → include all
    const stuck = await findStuckWithdrawals(0, 50);
    expect(stuck.some((w: { reference: string }) => w.reference === withdrawal.reference)).toBe(true);
    // far future threshold → empty
    const none = await findStuckWithdrawals(60 * 24 * 365, 50);
    expect(none).toHaveLength(0);
  });
});
