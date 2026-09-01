import Link from "next/link";

export default async function OrderCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ orderId?: string; status?: string }>;
}) {
  const sp = await searchParams;
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <h1 className="text-2xl font-semibold text-ink-950">
        {sp.status === "paid" ? "Payment received" : "Order update"}
      </h1>
      <p className="mt-2 text-sm text-ink-500">
        {sp.orderId
          ? `Order #${sp.orderId} has been recorded. You will be contacted about delivery.`
          : "Thank you for your order."}
      </p>
      <Link href="/" className="mt-6 text-sm font-medium text-brand-700">
        Back to SUBBY STORE
      </Link>
    </div>
  );
}
