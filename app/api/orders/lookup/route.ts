import { NextResponse } from "next/server";
import { z } from "zod";
import { getOrderByReference, listOrderItems } from "@/lib/server/repo";

const schema = z.object({
  reference: z.string().min(6).max(120),
  email: z.string().email().max(255),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid lookup" }, { status: 400 });
  }
  try {
    const order = await getOrderByReference(parsed.data.reference.trim());
    if (!order) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const email = parsed.data.email.toLowerCase().trim();
    if (order.customerEmail.toLowerCase() !== email) {
      return NextResponse.json({ error: "Order not found" }, { status: 404 });
    }
    const items = await listOrderItems(order.id);
    return NextResponse.json({
      order: {
        id: order.id,
        paymentReference: order.paymentReference,
        paymentStatus: order.paymentStatus,
        orderStatus: order.orderStatus,
        subtotalKobo: order.subtotalKobo,
        discountKobo: (order as { discountKobo?: number }).discountKobo ?? 0,
        totalKobo: order.totalKobo,
        couponCode: (order as { couponCode?: string | null }).couponCode ?? null,
        customerName: order.customerName,
        createdAt: order.createdAt,
        items: items.map((i) => ({
          productName: i.productNameSnapshot,
          quantity: i.quantity,
          unitPriceKobo: i.unitPriceKoboSnapshot,
          lineTotalKobo: i.lineTotalKobo,
        })),
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Lookup failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
