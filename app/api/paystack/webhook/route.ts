import { NextResponse } from "next/server";
import { verifyPaystackWebhookSignature } from "@/lib/server/paystack";
import { confirmPaidOrder, getOrderByReference } from "@/lib/server/repo";

export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody) as {
      event?: string;
      data?: {
        reference?: string;
        amount?: number;
        currency?: string;
        status?: string;
      };
    };

    if (event.event !== "charge.success") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const reference = event.data?.reference;
    const amount = event.data?.amount;
    const currency = event.data?.currency;

    if (!reference || typeof amount !== "number") {
      return NextResponse.json({ error: "malformed" }, { status: 400 });
    }

    const order = await getOrderByReference(reference);
    if (!order) {
      return NextResponse.json({ ok: true, unknown_reference: true });
    }

    if (currency && currency !== "NGN") {
      return NextResponse.json({ error: "currency_mismatch" }, { status: 400 });
    }

    if (amount !== order.totalKobo) {
      return NextResponse.json({ error: "amount_mismatch" }, { status: 400 });
    }

    const result = await confirmPaidOrder(reference, amount);
    return NextResponse.json({
      ok: true,
      alreadyPaid: result.alreadyPaid,
      orderId: result.order.id,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "webhook_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
