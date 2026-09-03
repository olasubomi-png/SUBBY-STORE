import Link from "next/link";

/**
 * Client redirect landing only. Payment success is authoritative via
 * Paystack webhook + /api/paystack/verify — not this page alone.
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
  const paidHint = sp.status === "paid";

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-ink-950">
        {paidHint ? "Payment received" : "Thanks — order received"}
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        {sp.orderId
          ? `Order #${sp.orderId} is being confirmed. You will be contacted about delivery once payment is verified.`
          : "Your order is being confirmed. Payment verification runs on the server."}
      </p>
      {sp.ref ? (
        <p className="mt-3 break-all text-xs text-ink-400">
          Reference: {sp.ref}
        </p>
      ) : null}
      <p className="mt-4 text-xs text-ink-400">
        Do not rely on this page alone as proof of payment. Confirmation is
        finalized after Paystack verification.
      </p>
      <Link href="/" className="mt-6 text-sm font-medium text-brand-700">
        Back to SUBBY STORE
      </Link>
    </div>
  );
}
