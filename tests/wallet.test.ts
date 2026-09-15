import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resetMemoryStore, memSignup, memCreateStore, memCreateProduct, memCreatePendingOrder } from "@/lib/server/memory-repo";
import { confirmPaidOrder } from "@/lib/server/repo";
import { creditOrderEarning, getWalletSummary, requestWithdrawal, completeWithdrawal, failWithdrawal, reverseWithdrawal, verifyAndSaveBankAccount, debitOrderRefund } from "@/lib/server/wallet";

beforeEach(() => {
  resetMemoryStore();
  process.env.USE_MEMORY_DB = "1";
  process.env.PAYSTACK_MODE = "mock";
  process.env.SESSION_SECRET = "dev_session_secret_at_least_32_chars_long";
  (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
});
afterEach(() => resetMemoryStore());

async function seed() {
  const user = await memSignup({ email: `w-${Math.random().toString(16).slice(2)}@ex.com`, password: "password12", fullName: "S" });
  const shop = memCreateStore({ ownerId: user.id, name: `W${Math.random().toString(16).slice(2, 6)}` });
  const product = memCreateProduct({ ownerId: user.id, storeId: shop.id, name: "Item", priceKobo: 250_000, stock: 20 });
  return { user, shop, product };
}

describe("earnings", () => {
  it("credits once on paid order", async () => {
    const { user, shop, product } = await seed();
    const ref = `ss_w_${Math.random().toString(16).slice(2)}`;
    const { order } = await memCreatePendingOrder({ storeId: shop.id, customerName: "B", customerPhone: "0801", customerEmail: "b@ex.com", deliveryAddress: "Lagos", items: [{ productId: product.id, quantity: 1 }], paymentReference: ref });
    await confirmPaidOrder(ref, order.totalKobo, "evt1");
    expect((await getWalletSummary(shop.id, user.id)).availableKobo).toBe(order.totalKobo);
    await confirmPaidOrder(ref, order.totalKobo, "evt1");
    expect((await getWalletSummary(shop.id, user.id)).availableKobo).toBe(order.totalKobo);
  });
});

describe("withdrawal", () => {
  it("lifecycle", async () => {
    const { user, shop } = await seed();
    await creditOrderEarning({ storeId: shop.id, orderId: 10, amountKobo: 500_000 });
    await verifyAndSaveBankAccount({ ownerId: user.id, storeId: shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789" });
    const { withdrawal } = await requestWithdrawal({ ownerId: user.id, storeId: shop.id, amountKobo: 200_000, idempotencyKey: "abc12345" });
    expect((await getWalletSummary(shop.id, user.id)).availableKobo).toBe(300_000);
    await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "t1" });
    expect((await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "t1" })).alreadyProcessed).toBe(true);
    expect((await getWalletSummary(shop.id, user.id)).lifetimeWithdrawnKobo).toBe(200_000);
    await creditOrderEarning({ storeId: shop.id, orderId: 20, amountKobo: 300_000 });
    const { withdrawal: w2 } = await requestWithdrawal({ ownerId: user.id, storeId: shop.id, amountKobo: 150_000, idempotencyKey: "failpath1" });
    await failWithdrawal({ reference: w2.reference, providerEventId: "f1" });
    expect((await failWithdrawal({ reference: w2.reference, providerEventId: "f1" })).alreadyProcessed).toBe(true);
  });
});

describe("security", () => {
  it("isolation and debt", async () => {
    const a = await seed(); const b = await seed();
    await creditOrderEarning({ storeId: a.shop.id, orderId: 99, amountKobo: 100_000 });
    await expect(getWalletSummary(a.shop.id, b.user.id)).rejects.toThrow(/Store not found/);
    await verifyAndSaveBankAccount({ ownerId: a.user.id, storeId: a.shop.id, bankCode: "058", bankName: "GTBank", accountNumber: "0123456789" });
    await creditOrderEarning({ storeId: a.shop.id, orderId: 40, amountKobo: 200_000 });
    const { withdrawal } = await requestWithdrawal({ ownerId: a.user.id, storeId: a.shop.id, amountKobo: 200_000, idempotencyKey: "debtpath1" });
    await completeWithdrawal({ reference: withdrawal.reference, providerEventId: "cdebt" });
    await debitOrderRefund({ storeId: a.shop.id, orderId: 40, amountKobo: 200_000 });
    expect((await getWalletSummary(a.shop.id, a.user.id)).debtKobo).toBe(200_000);
  });
});
