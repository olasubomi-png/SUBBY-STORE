import { NextResponse } from "next/server";
import {
  verifyPaystackTransaction,
  isPaystackMock,
} from "@/lib/server/paystack";
import { confirmPaidOrder, getOrderByReference } from "@/lib/server/repo";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const reference = url.searchParams.get("reference");
  if (!reference) {
    return NextResponse.json({ error: "reference required" }, { status: 400 });
  }

  try {
    const order = await getOrderByReference(reference);
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }

    const verified = await verifyPaystackTransaction(reference);

    if (isPaystackMock() && url.searchParams.get("mock") === "1") {
      const result = await confirmPaidOrder(reference, order.totalKobo);
      return NextResponse.redirect(
        new URL(
          `/store/order-complete?orderId=${order.id}&ref=${encodeURIComponent(reference)}&status=paid`,
          url.origin
        )
      );
    }

    if (verified.status !== "success") {
      return NextResponse.json(
        { error: "Payment not successful", status: verified.status },
        { status: 400 }
      );
    }

    if (verified.amountKobo !== order.totalKobo) {
      return NextResponse.json(
        { error: "Payment amount mismatch" },
        { status: 400 }
      );
    }

    if (verified.currency !== "NGN") {
      return NextResponse.json(
        { error: "Currency mismatch" },
        { status: 400 }
      );
    }

    const result = await confirmPaidOrder(reference, verified.amountKobo);
    return NextResponse.json({
      ok: true,
      alreadyPaid: result.alreadyPaid,
      orderId: result.order.id,
      paymentStatus: result.order.paymentStatus,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
