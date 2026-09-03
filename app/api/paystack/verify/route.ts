import { NextResponse } from "next/server";
import {
  verifyPaystackTransaction,
  isPaystackMock,
} from "@/lib/server/paystack";
import { confirmPaidOrder, getOrderByReference } from "@/lib/server/repo";
import { assertProductionConfig } from "@/lib/server/config";

export async function GET(req: Request) {
  try {
    assertProductionConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "config_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

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

    if (order.paymentStatus === "paid") {
      return NextResponse.json({
        ok: true,
        alreadyPaid: true,
        orderId: order.id,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        refundRequired: order.orderStatus === "refund_required",
      });
    }

    // Mock callback: confirm with order total (never trust client amount)
    if (isPaystackMock() && url.searchParams.get("mock") === "1") {
      const result = await confirmPaidOrder(reference, order.totalKobo);
      return NextResponse.redirect(
        new URL(
          `/store/order-complete?orderId=${order.id}&ref=${encodeURIComponent(reference)}&status=paid`,
          url.origin
        )
      );
    }

    const verified = await verifyPaystackTransaction(reference);

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
      orderStatus: result.order.orderStatus,
      refundRequired: Boolean(result.refundRequired),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
