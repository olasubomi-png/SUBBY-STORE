import { notFound, redirect } from "next/navigation";
import { getSession } from "@/lib/server/auth";
import { getOrderDetailForOwner } from "@/lib/server/order-management";
import { formatNgn } from "@/lib/money";

type Props = { params: Promise<{ id: string }> };

export default async function OrderPrintPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect("/login");

  const orderId = Number((await params).id);
  if (!Number.isSafeInteger(orderId)) notFound();

  const detail = await getOrderDetailForOwner(session.userId, orderId);
  if (!detail) notFound();

  const { order, items, store } = detail;
  const created =
    order.createdAt instanceof Date
      ? order.createdAt
      : new Date(order.createdAt as string);

  return (
    <div className="mx-auto max-w-2xl bg-white p-6 text-ink-900 print:p-0">
      <div className="mb-6 flex items-start justify-between gap-4 print:mb-4">
        <div>
          {store?.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={store.logoUrl}
              alt=""
              className="mb-2 h-12 w-12 rounded object-cover"
            />
          ) : null}
          <h1 className="text-xl font-semibold">{store?.name || "Store"}</h1>
          {store?.phone ? (
            <p className="text-sm text-ink-600">{store.phone}</p>
          ) : null}
          {store?.email ? (
            <p className="text-sm text-ink-600">{store.email}</p>
          ) : null}
          {store?.address ? (
            <p className="text-sm text-ink-600">{store.address}</p>
          ) : null}
        </div>
        <div className="text-right text-sm">
          <p className="font-semibold">Invoice / Order #{order.id}</p>
          <p className="text-ink-500">
            {created.toLocaleString("en-NG", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
          </p>
          <p className="mt-1 capitalize">
            Payment: {order.paymentStatus} · Order:{" "}
            {String(order.orderStatus).replace(/_/g, " ")}
          </p>
        </div>
      </div>

      <div className="mb-6 grid gap-4 border-y border-ink-100 py-4 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs uppercase text-ink-400">Bill to</p>
          <p className="font-medium">{order.customerName}</p>
          <p>{order.customerEmail}</p>
          <p>{order.customerPhone}</p>
          <p className="mt-1">{order.deliveryAddress}</p>
        </div>
        <div>
          <p className="text-xs uppercase text-ink-400">Reference</p>
          <p className="font-mono text-sm">
            {order.paymentReference || "—"}
          </p>
          {order.couponCode ? (
            <p className="mt-2 text-sm">Coupon: {order.couponCode}</p>
          ) : null}
        </div>
      </div>

      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-ink-200 text-xs uppercase text-ink-400">
            <th className="py-2 font-medium">Item</th>
            <th className="py-2 font-medium">Qty</th>
            <th className="py-2 font-medium">Unit</th>
            <th className="py-2 text-right font-medium">Line</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-ink-50">
              <td className="py-2">{it.productNameSnapshot}</td>
              <td className="py-2 tabular-nums">{it.quantity}</td>
              <td className="py-2 tabular-nums">
                {formatNgn(it.unitPriceKoboSnapshot)}
              </td>
              <td className="py-2 text-right tabular-nums">
                {formatNgn(it.lineTotalKobo)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="mt-4 ml-auto w-full max-w-xs space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span className="tabular-nums">
            {formatNgn(order.subtotalKobo)}
          </span>
        </div>
        {(order.discountKobo || 0) > 0 ? (
          <div className="flex justify-between">
            <span>Discount</span>
            <span className="tabular-nums">
              −{formatNgn(order.discountKobo || 0)}
            </span>
          </div>
        ) : null}
        <div className="flex justify-between border-t border-ink-200 pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatNgn(order.totalKobo)}</span>
        </div>
      </div>

      <div className="mt-8 print:hidden">
        <button
          type="button"
          // Client print via inline is limited; use a simple form action alternative
          className="rounded-lg bg-ink-900 px-4 py-2 text-sm font-medium text-white"
        >
          {/* print via script tag */}
          Print
        </button>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.currentScript.previousElementSibling.addEventListener('click',()=>window.print())`,
          }}
        />
      </div>
    </div>
  );
}
