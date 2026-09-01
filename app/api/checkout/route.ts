import { NextResponse } from "next/server";
import { z } from "zod";
import { cartSchema } from "@/lib/server/cart";
import { createPendingOrder, getStoreBySlug } from "@/lib/server/repo";
import {
  initializePaystackTransaction,
  appUrl,
} from "@/lib/server/paystack";
import { randomUUID } from "crypto";

const checkoutSchema = z.object({
  storeSlug: z.string().min(2).max(80),
  customerName: z.string().min(2).max(120),
  customerPhone: z.string().min(7).max(32),
  customerEmail: z.string().email().max(255),
  deliveryAddress: z.string().min(5).max(500),
  note: z.string().max(1000).optional(),
  items: cartSchema.shape.items,
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid checkout" },
        { status: 400 }
      );
    }

    const store = await getStoreBySlug(parsed.data.storeSlug);
    if (!store) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    const reference = `ss_${store.id}_${Date.now()}_${randomUUID().slice(0, 8)}`;

    const { order, cart } = await createPendingOrder({
      storeId: store.id,
      customerName: parsed.data.customerName,
      customerPhone: parsed.data.customerPhone,
      customerEmail: parsed.data.customerEmail,
      deliveryAddress: parsed.data.deliveryAddress,
      note: parsed.data.note,
      items: parsed.data.items,
      paymentReference: reference,
    });

    const callbackUrl = `${appUrl()}/store/${store.slug}/order/${order.id}?ref=${encodeURIComponent(reference)}`;

    const paystack = await initializePaystackTransaction({
      email: parsed.data.customerEmail,
      amountKobo: cart.totalKobo,
      reference,
      callbackUrl,
      metadata: { orderId: order.id, storeId: store.id },
    });

    return NextResponse.json({
      orderId: order.id,
      reference,
      totalKobo: cart.totalKobo,
      authorizationUrl: paystack.authorizationUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Checkout failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
