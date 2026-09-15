import crypto from "crypto";
import { isPaystackMockMode, requirePaystackSecret } from "@/lib/server/config";

export type PaystackInitResult = {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
};

export type PaystackVerifyResult = {
  status: "success" | "failed" | "abandoned" | "pending";
  amountKobo: number;
  currency: string;
  reference: string;
  paidAt: string | null;
  /** Card authorization for recurring charges / subscriptions */
  authorizationCode: string | null;
  customerCode: string | null;
  /** Present when charge is tied to a Paystack subscription */
  subscriptionCode: string | null;
  planCode: string | null;
  /** Provider next payment date when available (ISO) */
  nextPaymentDate: string | null;
};

export type PaystackPlanResult = {
  planCode: string;
  name: string;
  amountKobo: number;
  interval: string;
};

export type PaystackSubscriptionResult = {
  subscriptionCode: string;
  customerCode: string | null;
  planCode: string | null;
  status: string;
  nextPaymentDate: string | null;
  emailToken: string | null;
};

function secretKey(): string {
  return requirePaystackSecret();
}

export function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

/** Mock mode — never true in production (throws if misconfigured). */
export function isPaystackMock(): boolean {
  return isPaystackMockMode();
}

async function paystackFetch<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const res = await fetch(`https://api.paystack.co${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json()) as {
    status: boolean;
    message?: string;
    data?: T;
  };
  if (!res.ok || !data.status || data.data === undefined) {
    throw new Error(data.message || `Paystack ${path} failed`);
  }
  return data.data;
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  /** Paystack plan code — enables subscription on successful charge */
  planCode?: string | null;
}): Promise<PaystackInitResult> {
  if (isPaystackMock()) {
    const accessCode = `mock_access_${input.reference}`;
    return {
      authorizationUrl: `${appUrl()}/api/paystack/verify?reference=${encodeURIComponent(input.reference)}&mock=1`,
      accessCode,
      reference: input.reference,
    };
  }

  const body: Record<string, unknown> = {
    email: input.email,
    amount: input.amountKobo,
    reference: input.reference,
    currency: "NGN",
    callback_url: input.callbackUrl,
    metadata: input.metadata,
  };
  if (input.planCode) {
    body.plan = input.planCode;
  }

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as {
    status: boolean;
    message?: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!res.ok || !data.status || !data.data) {
    throw new Error(data.message || "Unable to initialize payment");
  }

  return {
    authorizationUrl: data.data.authorization_url,
    accessCode: data.data.access_code,
    reference: data.data.reference,
  };
}

export async function verifyPaystackTransaction(
  reference: string
): Promise<PaystackVerifyResult> {
  if (isPaystackMock()) {
    return {
      status: "success",
      amountKobo: 0,
      currency: "NGN",
      reference,
      paidAt: new Date().toISOString(),
      authorizationCode: `AUTH_mock_${reference}`,
      customerCode: `CUS_mock_${reference.slice(0, 12)}`,
      subscriptionCode: reference.startsWith("sub_")
        ? `SUB_mock_${reference.slice(0, 16)}`
        : null,
      planCode: null,
      nextPaymentDate: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
    };
  }

  const res = await fetch(
    `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
    {
      headers: { Authorization: `Bearer ${secretKey()}` },
    }
  );

  const data = (await res.json()) as {
    status: boolean;
    message?: string;
    data?: {
      status: string;
      amount: number;
      currency: string;
      reference: string;
      paid_at?: string;
      authorization?: { authorization_code?: string };
      customer?: { customer_code?: string };
      plan?: { plan_code?: string };
      subscription?: { subscription_code?: string; next_payment_date?: string };
    };
  };

  if (!res.ok || !data.status || !data.data) {
    throw new Error(data.message || "Unable to verify payment");
  }

  const d = data.data;
  const st = d.status;
  return {
    status:
      st === "success"
        ? "success"
        : st === "failed"
          ? "failed"
          : st === "abandoned"
            ? "abandoned"
            : "pending",
    amountKobo: d.amount,
    currency: d.currency,
    reference: d.reference,
    paidAt: d.paid_at ?? null,
    authorizationCode: d.authorization?.authorization_code ?? null,
    customerCode: d.customer?.customer_code ?? null,
    subscriptionCode: d.subscription?.subscription_code ?? null,
    planCode: d.plan?.plan_code ?? null,
    nextPaymentDate: d.subscription?.next_payment_date ?? null,
  };
}

/**
 * Create a Paystack plan (idempotent by name+amount+interval when listing).
 * Prefer storing plan codes in DB / env rather than recreating each checkout.
 */
export async function createPaystackPlan(input: {
  name: string;
  amountKobo: number;
  interval: "monthly" | "annually";
  description?: string;
}): Promise<PaystackPlanResult> {
  if (isPaystackMock()) {
    return {
      planCode: `PLN_mock_${input.name.toLowerCase().replace(/\s+/g, "_")}`,
      name: input.name,
      amountKobo: input.amountKobo,
      interval: input.interval,
    };
  }
  const data = await paystackFetch<{
    plan_code: string;
    name: string;
    amount: number;
    interval: string;
  }>("/plan", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      amount: input.amountKobo,
      interval: input.interval,
      currency: "NGN",
      description: input.description || input.name,
    }),
  });
  return {
    planCode: data.plan_code,
    name: data.name,
    amountKobo: data.amount,
    interval: data.interval,
  };
}

/** Create Paystack subscription after card authorization is available. */
export async function createPaystackSubscription(input: {
  customerCode: string;
  planCode: string;
  authorizationCode?: string;
  startDate?: string;
}): Promise<PaystackSubscriptionResult> {
  if (isPaystackMock()) {
    return {
      subscriptionCode: `SUB_mock_${Date.now().toString(36)}`,
      customerCode: input.customerCode,
      planCode: input.planCode,
      status: "active",
      nextPaymentDate: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
      emailToken: "mock_email_token",
    };
  }
  const body: Record<string, unknown> = {
    customer: input.customerCode,
    plan: input.planCode,
  };
  if (input.authorizationCode) body.authorization = input.authorizationCode;
  if (input.startDate) body.start_date = input.startDate;

  const data = await paystackFetch<{
    subscription_code: string;
    status: string;
    next_payment_date?: string;
    email_token?: string;
    customer?: { customer_code?: string };
    plan?: { plan_code?: string };
  }>("/subscription", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    subscriptionCode: data.subscription_code,
    customerCode: data.customer?.customer_code ?? input.customerCode,
    planCode: data.plan?.plan_code ?? input.planCode,
    status: data.status,
    nextPaymentDate: data.next_payment_date ?? null,
    emailToken: data.email_token ?? null,
  };
}

export async function fetchPaystackSubscription(
  subscriptionCode: string
): Promise<PaystackSubscriptionResult> {
  if (isPaystackMock()) {
    return {
      subscriptionCode,
      customerCode: null,
      planCode: null,
      status: "active",
      nextPaymentDate: new Date(
        Date.now() + 30 * 24 * 60 * 60 * 1000
      ).toISOString(),
      emailToken: "mock_email_token",
    };
  }
  const data = await paystackFetch<{
    subscription_code: string;
    status: string;
    next_payment_date?: string;
    email_token?: string;
    customer?: { customer_code?: string };
    plan?: { plan_code?: string };
  }>(`/subscription/${encodeURIComponent(subscriptionCode)}`);
  return {
    subscriptionCode: data.subscription_code,
    customerCode: data.customer?.customer_code ?? null,
    planCode: data.plan?.plan_code ?? null,
    status: data.status,
    nextPaymentDate: data.next_payment_date ?? null,
    emailToken: data.email_token ?? null,
  };
}

/** Disable recurring subscription on Paystack (no further renewals). */
export async function disablePaystackSubscription(
  subscriptionCode: string
): Promise<void> {
  if (isPaystackMock()) return;
  if (!subscriptionCode) throw new Error("Missing subscription code");
  try {
    const sub = await fetchPaystackSubscription(subscriptionCode);
    if (!sub.emailToken) {
      throw new Error("Unable to disable subscription: missing email token");
    }
    await paystackFetch("/subscription/disable", {
      method: "POST",
      body: JSON.stringify({
        code: subscriptionCode,
        token: sub.emailToken,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "disable failed";
    // Treat already-disabled as success for idempotent cancel
    if (/already|not active|disabled/i.test(msg)) return;
    throw new Error(`Paystack disable failed: ${msg}`);
  }
}

/** Re-enable a previously disabled Paystack subscription when supported. */
export async function enablePaystackSubscription(
  subscriptionCode: string
): Promise<void> {
  if (isPaystackMock()) return;
  if (!subscriptionCode) throw new Error("Missing subscription code");
  try {
    const sub = await fetchPaystackSubscription(subscriptionCode);
    if (!sub.emailToken) {
      throw new Error("Unable to enable subscription: missing email token");
    }
    await paystackFetch("/subscription/enable", {
      method: "POST",
      body: JSON.stringify({
        code: subscriptionCode,
        token: sub.emailToken,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "enable failed";
    if (/already|active/i.test(msg) && !/not active/i.test(msg)) return;
    throw new Error(`Paystack enable failed: ${msg}`);
  }
}

export function verifyPaystackWebhookSignature(
  rawBody: string | Buffer,
  signature: string | null
): boolean {
  if (isPaystackMock()) {
    return signature === "mock-valid-signature" || signature === "test";
  }
  if (!signature) return false;
  const hash = crypto
    .createHmac("sha512", secretKey())
    .update(typeof rawBody === "string" ? rawBody : rawBody)
    .digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(signature));
  } catch {
    return false;
  }
}


export type PaystackBank = { name: string; code: string; active: boolean };
export async function listPaystackBanks(): Promise<PaystackBank[]> {
  if (isPaystackMock()) return [{ name: "Access Bank", code: "044", active: true }, { name: "GTBank", code: "058", active: true }, { name: "Zenith Bank", code: "057", active: true }, { name: "UBA", code: "033", active: true }];
  const data = await paystackFetch<Array<{ name: string; code: string; active: boolean }>>("/bank?country=nigeria&currency=NGN");
  return (data || []).filter((b) => b.active !== false).map((b) => ({ name: b.name, code: b.code, active: true }));
}
export async function resolvePaystackAccount(input: { accountNumber: string; bankCode: string }) {
  if (isPaystackMock()) {
    if (!/^\d{10}$/.test(input.accountNumber)) throw new Error("Invalid account number");
    return { accountNumber: input.accountNumber, accountName: "MOCK ACCOUNT HOLDER", bankId: 1 as number | null };
  }
  const q = new URLSearchParams({ account_number: input.accountNumber, bank_code: input.bankCode });
  const data = await paystackFetch<{ account_number: string; account_name: string; bank_id?: number }>(`/bank/resolve?${q}`);
  return { accountNumber: data.account_number, accountName: data.account_name, bankId: data.bank_id ?? null };
}
export async function createPaystackTransferRecipient(input: { name: string; accountNumber: string; bankCode: string }) {
  if (isPaystackMock()) return { recipientCode: `RCP_mock_${input.bankCode}_${input.accountNumber.slice(-4)}`, details: {} };
  const data = await paystackFetch<{ recipient_code: string }>("/transferrecipient", { method: "POST", body: JSON.stringify({ type: "nuban", name: input.name, account_number: input.accountNumber, bank_code: input.bankCode, currency: "NGN" }) });
  return { recipientCode: data.recipient_code, details: {} };
}
export async function initiatePaystackTransfer(input: { amountKobo: number; recipientCode: string; reference: string; reason?: string }) {
  if (isPaystackMock()) {
    if (input.reference.includes("_fail_")) throw new Error("Transfer rejected by provider (mock)");
    return { transferCode: `TRF_mock_${input.reference.slice(0, 20)}`, reference: input.reference, status: "pending" };
  }
  const data = await paystackFetch<{ transfer_code?: string; reference?: string; status?: string }>("/transfer", { method: "POST", body: JSON.stringify({ source: "balance", amount: input.amountKobo, recipient: input.recipientCode, reference: input.reference, reason: input.reason || "Seller withdrawal", currency: "NGN" }) });
  return { transferCode: data.transfer_code ?? null, reference: data.reference || input.reference, status: data.status || "pending" };
}
