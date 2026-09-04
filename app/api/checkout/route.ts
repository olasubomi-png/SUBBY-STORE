import { NextResponse } from "next/server";
import { z } from "zod";
import { cartSchema } from "@/lib/server/cart";
import {
  createPendingOrder,
  getStoreBySlug,
  markOrderPaymentFailed,
} from "@/lib/server/repo";
import {
  initializePaystackTransaction,
  appUrl,
} from "@/lib/server/paystack";
import { randomUUID } from "crypto";
import { assertProductionConfig } from "@/lib/server/config";

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
    assertProductionConfig();

    const body = await req.json();
    const parsed = checkoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error:
            parsed.error.errors[0]?.message ||
            "Invalid checkout",
        },
        { status: 400 }
      );
    }

    const store = await getStoreBySlug(parsed.data.storeSlug);

    if (!store) {
      return NextResponse.json(
        { error: "Store not found" },
        { status: 404 }
      );
    }

    const reference =
      `ss_${store.id}_${Date.now()}_${randomUUID().slice(0, 8)}`;

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

    /*
     * IMPORTANT:
     * The actual order-complete route is:
     * /store/order-complete
     *
     * Do not include the store slug here.
     * Paystack redirects back to this global route,
     * and the page verifies the payment state from the server.
     */
    const callbackUrl =
      `${appUrl()}/store/order-complete` +
      `?orderId=${encodeURIComponent(order.id)}` +
      `&ref=${encodeURIComponent(reference)}`;

    try {
      const paystack = await initializePaystackTransaction({
        email: parsed.data.customerEmail,
        amountKobo: cart.totalKobo,
        reference,
        callbackUrl,
        metadata: {
          orderId: order.id,
          storeId: store.id,
        },
      });

      return NextResponse.json({
        orderId: order.id,
        reference,
        totalKobo: cart.totalKobo,
        authorizationUrl: paystack.authorizationUrl,
      });
    } catch (initError) {
      /*
       * If Paystack initialization fails after the pending order
       * has been created, mark the payment as failed so we don't
       * leave an ambiguous pending payment behind.
       */
      try {
        await markOrderPaymentFailed(reference);
      } catch {
        /* best-effort cleanup */
      }

      const msg =
        initError instanceof Error
          ? initError.message
          : "Unable to initialize payment";

      return NextResponse.json(
        {
          error: msg,
          orderId: order.id,
        },
        { status: 502 }
      );
    }
  } catch (e) {
    const msg =
      e instanceof Error
        ? e.message
        : "Checkout failed";

    return NextResponse.json(
      { error: msg },
      { status: 400 }
    );
  }
}
