import { NextResponse } from "next/server";
import { verifyPaystackWebhookSignature } from "@/lib/server/paystack";
import { confirmPaidOrder, getOrderByReference } from "@/lib/server/repo";
import { assertProductionConfig } from "@/lib/server/config";
import {
  confirmSubscriptionPayment,
  confirmRenewalPayment,
  markSubscriptionPastDue,
  markSubscriptionNonRenewing,
  markSubscriptionDisabledByProvider,
} from "@/lib/server/subscriptions";
import { completeWithdrawal, failWithdrawal, reverseWithdrawal } from "@/lib/server/wallet";

export async function POST(req: Request) {
  try {
    assertProductionConfig();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "config_error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("x-paystack-signature");

  if (!verifyPaystackWebhookSignature(rawBody, signature)) {
    return NextResponse.json({ error: "invalid_signature" }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody) as {
      event?: string;
      id?: string | number;
      data?: {
        id?: number;
        reference?: string;
        amount?: number;
        currency?: string;
        status?: string;
        metadata?: { purpose?: string; storeId?: number; subscriptionId?: number };
        customer?: { customer_code?: string };
        authorization?: { authorization_code?: string };
        plan?: { plan_code?: string };
        subscription?: {
          subscription_code?: string;
          next_payment_date?: string;
          status?: string;
        };
      };
    };

    const eventName = event.event || "";
    const rawEventId =
      event.id != null
        ? String(event.id)
        : event.data?.id != null
          ? String(event.data.id)
          : null;


    if (eventName === "transfer.success" || eventName === "transfer.failed" || eventName === "transfer.reversed") {
      const transferRef = (event.data as { reference?: string })?.reference || null;
      const transferCode = (event.data as { transfer_code?: string })?.transfer_code || null;
      if (!transferRef) return NextResponse.json({ ok: true, ignored: true });
      try {
        if (eventName === "transfer.success") {
          const result = await completeWithdrawal({ reference: transferRef, transferCode, providerEventId: rawEventId });
          return NextResponse.json({ ok: true, type: "transfer_success", alreadyProcessed: result.alreadyProcessed });
        }
        if (eventName === "transfer.failed") {
          const result = await failWithdrawal({ reference: transferRef, reason: "failed", providerEventId: rawEventId });
          return NextResponse.json({ ok: true, type: "transfer_failed", alreadyProcessed: result.alreadyProcessed });
        }
        const result = await reverseWithdrawal({ reference: transferRef, providerEventId: rawEventId });
        return NextResponse.json({ ok: true, type: "transfer_reversed", alreadyProcessed: result.alreadyProcessed });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "transfer_webhook_failed";
        if (
          msg === "withdrawal_not_found" ||
          msg.startsWith("cannot_complete_") ||
          msg === "cannot_fail_successful_withdrawal" ||
          msg === "can_only_reverse_success"
        ) {
          return NextResponse.json({ ok: true, ignored_transition: true, reason: msg });
        }
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    // --- Will not renew (not a payment failure) ---
    if (eventName === "subscription.not_renew") {
      const subCode = event.data?.subscription?.subscription_code ?? null;
      const customerCode = event.data?.customer?.customer_code ?? null;
      const result = await markSubscriptionNonRenewing({
        subscriptionCode: subCode,
        customerCode,
        rawEventId,
      });
      return NextResponse.json({
        ok: true,
        type: "subscription_not_renew",
        found: Boolean(result),
        status: result?.status ?? null,
        cancelAtPeriodEnd: result?.cancelAtPeriodEnd ?? null,
      });
    }

    // --- Provider disabled subscription (not a payment failure) ---
    if (eventName === "subscription.disable") {
      const subCode = event.data?.subscription?.subscription_code ?? null;
      const customerCode = event.data?.customer?.customer_code ?? null;
      const result = await markSubscriptionDisabledByProvider({
        subscriptionCode: subCode,
        customerCode,
        rawEventId,
      });
      return NextResponse.json({
        ok: true,
        type: "subscription_disable",
        found: Boolean(result),
        status: result?.status ?? null,
        cancelAtPeriodEnd: result?.cancelAtPeriodEnd ?? null,
      });
    }

    // --- Failed recurring payment ---
    if (
      eventName === "invoice.payment_failed" ||
      (eventName === "charge.failed" && event.data?.subscription?.subscription_code)
    ) {
      const subCode = event.data?.subscription?.subscription_code ?? null;
      const customerCode = event.data?.customer?.customer_code ?? null;
      const result = await markSubscriptionPastDue({
        subscriptionCode: subCode,
        customerCode,
        rawEventId,
      });
      return NextResponse.json({
        ok: true,
        type: "subscription_past_due",
        found: Boolean(result),
        status: result?.status ?? null,
      });
    }

    if (eventName !== "charge.success" && eventName !== "invoice.payment_success") {
      return NextResponse.json({ ok: true, ignored: true });
    }

    const reference = event.data?.reference;
    const amount = event.data?.amount;
    const currency = event.data?.currency;

    if (!reference || typeof amount !== "number") {
      return NextResponse.json({ error: "malformed" }, { status: 400 });
    }

    const isSubscriptionCheckout =
      reference.startsWith("sub_") ||
      event.data?.metadata?.purpose === "subscription";

    const isRenewal =
      eventName === "invoice.payment_success" ||
      Boolean(event.data?.subscription?.subscription_code && !isSubscriptionCheckout);

    if (isRenewal && event.data?.subscription?.subscription_code) {
      try {
        const result = await confirmRenewalPayment({
          reference,
          amountKobo: amount,
          currency,
          rawEventId,
          customerCode: event.data?.customer?.customer_code ?? null,
          subscriptionCode: event.data.subscription.subscription_code,
          nextPaymentDate: event.data.subscription.next_payment_date ?? null,
        });
        return NextResponse.json({
          ok: true,
          type: "subscription_renewal",
          alreadyProcessed: result.alreadyProcessed,
          plan: result.plan.slug,
          status: result.subscription.status,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "renewal_failed";
        if (msg === "subscription_not_found") {
          return NextResponse.json({ ok: true, unknown_subscription: true });
        }
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    if (isSubscriptionCheckout) {
      try {
        const result = await confirmSubscriptionPayment({
          reference,
          amountKobo: amount,
          currency,
          rawEventId,
          authorizationCode: event.data?.authorization?.authorization_code ?? null,
          customerCode: event.data?.customer?.customer_code ?? null,
          subscriptionCode: event.data?.subscription?.subscription_code ?? null,
          nextPaymentDate: event.data?.subscription?.next_payment_date ?? null,
          planCode: event.data?.plan?.plan_code ?? null,
        });
        return NextResponse.json({
          ok: true,
          type: "subscription",
          alreadyProcessed: result.alreadyProcessed,
          plan: result.plan.slug,
          status: result.subscription.status,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "subscription_webhook_failed";
        if (msg === "unknown_reference") {
          return NextResponse.json({ ok: true, unknown_reference: true });
        }
        return NextResponse.json({ error: msg }, { status: 400 });
      }
    }

    const order = await getOrderByReference(reference);
    if (!order) {
      // Try subscription confirm as fallback
      try {
        const result = await confirmSubscriptionPayment({
          reference,
          amountKobo: amount,
          currency,
          rawEventId,
          authorizationCode: event.data?.authorization?.authorization_code ?? null,
          customerCode: event.data?.customer?.customer_code ?? null,
          subscriptionCode: event.data?.subscription?.subscription_code ?? null,
          nextPaymentDate: event.data?.subscription?.next_payment_date ?? null,
          planCode: event.data?.plan?.plan_code ?? null,
        });
        return NextResponse.json({
          ok: true,
          type: "subscription",
          alreadyProcessed: result.alreadyProcessed,
          plan: result.plan.slug,
          status: result.subscription.status,
        });
      } catch {
        return NextResponse.json({ ok: true, unknown_reference: true });
      }
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

    if (currency && currency !== "NGN") {
      return NextResponse.json({ error: "currency_mismatch" }, { status: 400 });
    }

    if (amount !== order.totalKobo) {
      return NextResponse.json({ error: "amount_mismatch" }, { status: 400 });
    }

    const result = await confirmPaidOrder(reference, amount, rawEventId);
    return NextResponse.json({
      ok: true,
      alreadyPaid: result.alreadyPaid,
      orderId: result.order.id,
      paymentStatus: result.order.paymentStatus,
      orderStatus: result.order.orderStatus,
      refundRequired: Boolean(result.refundRequired),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "webhook_failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
