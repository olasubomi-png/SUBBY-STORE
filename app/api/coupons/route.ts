import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  listCouponsForOwner,
  createCoupon,
} from "@/lib/server/coupons";
import { createCouponSchema } from "@/lib/coupons/schema";
import { listStoresForOwner } from "@/lib/server/repo";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const storeId = Number(new URL(req.url).searchParams.get("storeId"));
  try {
    let sid = storeId;
    if (!Number.isSafeInteger(sid) || sid <= 0) {
      const stores = await listStoresForOwner(session.userId);
      sid = stores[0]?.id;
      if (!sid) {
        return NextResponse.json({ coupons: [], storeId: null });
      }
    }
    const coupons = await listCouponsForOwner(session.userId, sid);
    return NextResponse.json({ coupons, storeId: sid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = createCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid" },
      { status: 400 }
    );
  }
  try {
    const d = parsed.data;
    const coupon = await createCoupon(session.userId, {
      storeId: d.storeId,
      code: d.code,
      type: d.type,
      value: d.value,
      minimumOrderAmountNgn: d.minimumOrderAmountNgn,
      maximumDiscountAmountNgn: d.maximumDiscountAmountNgn,
      startsAt: d.startsAt ? new Date(d.startsAt) : null,
      expiresAt: d.expiresAt ? new Date(d.expiresAt) : null,
      usageLimit: d.usageLimit ?? null,
      perCustomerLimit: d.perCustomerLimit ?? null,
      active: d.active,
      productIds: d.productIds,
    });
    return NextResponse.json({ coupon });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { patchCouponSchema } = await import("@/lib/coupons/schema");
  const parsed = patchCouponSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid" },
      { status: 400 }
    );
  }
  try {
    const { updateCoupon } = await import("@/lib/server/coupons");
    const d = parsed.data;
    const coupon = await updateCoupon(session.userId, d.couponId, {
      code: d.code,
      type: d.type,
      value: d.value,
      minimumOrderAmountNgn: d.minimumOrderAmountNgn,
      maximumDiscountAmountNgn: d.maximumDiscountAmountNgn,
      startsAt:
        d.startsAt === undefined
          ? undefined
          : d.startsAt
            ? new Date(d.startsAt)
            : null,
      expiresAt:
        d.expiresAt === undefined
          ? undefined
          : d.expiresAt
            ? new Date(d.expiresAt)
            : null,
      usageLimit: d.usageLimit,
      perCustomerLimit: d.perCustomerLimit,
      active: d.active,
      productIds: d.productIds,
    });
    return NextResponse.json({ coupon });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const couponId = Number(new URL(req.url).searchParams.get("couponId"));
  if (!Number.isSafeInteger(couponId) || couponId <= 0) {
    return NextResponse.json({ error: "Invalid coupon" }, { status: 400 });
  }
  try {
    const { deleteCoupon } = await import("@/lib/server/coupons");
    await deleteCoupon(session.userId, couponId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
