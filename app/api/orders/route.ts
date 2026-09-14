import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { updateOrderStatus } from "@/lib/server/repo";
import {
  listOrdersManaged,
  bulkUpdateFulfillmentStatus,
  updateSellerNote,
} from "@/lib/server/order-management";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = new URL(req.url);
  const result = await listOrdersManaged(session.userId, {
    q: url.searchParams.get("q") || undefined,
    paymentStatus: url.searchParams.get("paymentStatus") || undefined,
    orderStatus: url.searchParams.get("orderStatus") || undefined,
    from: url.searchParams.get("from") || undefined,
    to: url.searchParams.get("to") || undefined,
    minTotalKobo: url.searchParams.get("minTotalKobo")
      ? Number(url.searchParams.get("minTotalKobo"))
      : undefined,
    maxTotalKobo: url.searchParams.get("maxTotalKobo")
      ? Number(url.searchParams.get("maxTotalKobo"))
      : undefined,
    page: url.searchParams.get("page")
      ? Number(url.searchParams.get("page"))
      : 1,
    pageSize: url.searchParams.get("pageSize")
      ? Number(url.searchParams.get("pageSize"))
      : 20,
  });
  return NextResponse.json(result);
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();

    // Bulk update
    if (Array.isArray(body.orderIds) && body.orderStatus) {
      const orderIds = body.orderIds.map((id: unknown) => Number(id));
      const result = await bulkUpdateFulfillmentStatus(
        session.userId,
        orderIds,
        String(body.orderStatus)
      );
      return NextResponse.json(result);
    }

    // Seller note
    if (body.sellerNote !== undefined && body.orderId != null) {
      const orderId = Number(body.orderId);
      if (!Number.isSafeInteger(orderId)) {
        return NextResponse.json({ error: "Invalid order" }, { status: 400 });
      }
      const order = await updateSellerNote(
        session.userId,
        orderId,
        String(body.sellerNote ?? "")
      );
      return NextResponse.json({ order });
    }

    // Single status update
    const orderId = Number(body.orderId);
    const orderStatus = String(body.orderStatus || "");
    if (!Number.isSafeInteger(orderId)) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }
    const order = await updateOrderStatus(
      session.userId,
      orderId,
      orderStatus
    );
    return NextResponse.json({ order });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
