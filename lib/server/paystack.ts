import crypto from "crypto";

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
};

function secretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  return key;
}

export function appUrl(): string {
  return process.env.APP_URL || "http://localhost:3000";
}

/** Mock mode when secret starts with sk_test_REPLACE or MOCK */
export function isPaystackMock(): boolean {
  const key = process.env.PAYSTACK_SECRET_KEY || "";
  return (
    key.includes("REPLACE") ||
    key === "sk_test_mock" ||
    process.env.PAYSTACK_MODE === "mock"
  );
}

export async function initializePaystackTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
}): Promise<PaystackInitResult> {
  if (isPaystackMock()) {
    const accessCode = `mock_access_${input.reference}`;
    return {
      authorizationUrl: `${appUrl()}/api/paystack/verify?reference=${encodeURIComponent(input.reference)}&mock=1`,
      accessCode,
      reference: input.reference,
    };
  }

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      currency: "NGN",
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    }),
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
      amountKobo: 0, // caller must still match against order
      currency: "NGN",
      reference,
      paidAt: new Date().toISOString(),
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
    };
  };

  if (!res.ok || !data.status || !data.data) {
    throw new Error(data.message || "Unable to verify payment");
  }

  const st = data.data.status;
  return {
    status:
      st === "success"
        ? "success"
        : st === "failed"
          ? "failed"
          : st === "abandoned"
            ? "abandoned"
            : "pending",
    amountKobo: data.data.amount,
    currency: data.data.currency,
    reference: data.data.reference,
    paidAt: data.data.paid_at ?? null,
  };
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
    return crypto.timingSafeEqual(
      Buffer.from(hash),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}
