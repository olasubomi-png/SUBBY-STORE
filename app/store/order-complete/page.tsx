import Link from "next/link";
import { getOrderByReference } from "@/lib/server/repo";

/**
 * Payment status is read from the server/database.
 * Paystack redirect alone is never treated as proof of payment.
 */
export default async function OrderCompletePage({
  searchParams,
}: {
  searchParams: Promise<{
    orderId?: string;
    ref?: string;
    status?: string;
  }>;
}) {
  const sp = await searchParams;
  let orderStatus: string | null = null;
  let paymentStatus: string | null = null;

  if (sp.ref) {
    try {
      const order = await getOrderByReference(sp.ref);
      if (order) {
        orderStatus = order.orderStatus;
        paymentStatus = order.paymentStatus;
      }
    } catch {
      /* ignore lookup failures */
    }
  }

  const refundRequired = orderStatus === "refund_required";
  const paidConfirmed =
    paymentStatus === "paid" && orderStatus === "confirmed";
  const pending = !paymentStatus || paymentStatus === "pending";

  let title = "Thanks — order received";
  let body =
    "Your order is being confirmed. Payment verification runs on the server.";

  if (refundRequired) {
    title = "Payment received — refund required";
    body =
      "Payment was received, but the item became unavailable. Your order requires a refund. Please contact the store.";
  } else if (paidConfirmed) {
    title = "Payment confirmed";
    body = sp.orderId
      ? `Order #${sp.orderId} is confirmed. You will be contacted about delivery.`
      : "Your payment is confirmed. You will be contacted about delivery.";
  } else if (pending) {
    title = "Confirming payment";
    body =
      "We are verifying your payment with Paystack. This page is not proof of payment by itself.";
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-ink-950">{title}</h1>
      <p className="mt-2 text-sm text-ink-500">{body}</p>
      {sp.orderId ? (
        <p className="mt-3 text-sm text-ink-600">Order #{sp.orderId}</p>
      ) : null}
      {sp.ref ? (
        <p className="mt-2 break-all text-xs text-ink-400">
          Reference: {sp.ref}
        </p>
      ) : null}
      {orderStatus ? (
        <p className="mt-3 text-xs uppercase tracking-wide text-ink-400">
          Payment {paymentStatus} · Order {orderStatus}
        </p>
      ) : null}
      <Link href="/" className="mt-6 text-sm font-medium text-brand-700">
        Back to SUBBY STORE
      </Link>
    </div>
  );
}
