import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getOrderDetailForOwner } from "@/lib/server/order-management";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const orderId = Number((await ctx.params).id);
  if (!Number.isSafeInteger(orderId)) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }
  const detail = await getOrderDetailForOwner(session.userId, orderId);
  if (!detail) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(detail);
}
