import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { listOrdersForOwner, updateOrderStatus } from "@/lib/server/repo";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orders = await listOrdersForOwner(session.userId);
  return NextResponse.json({ orders });
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const orderId = Number(body.orderId);
    const orderStatus = String(body.orderStatus || "");
    if (!Number.isSafeInteger(orderId)) {
      return NextResponse.json({ error: "Invalid order" }, { status: 400 });
    }
    const order = await updateOrderStatus(session.userId, orderId, orderStatus);
    return NextResponse.json({ order });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
