import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getCustomerDetailForOwner } from "@/lib/server/customers";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { key } = await ctx.params;
  const decoded = decodeURIComponent(key || "");
  if (!decoded || decoded.length > 320) {
    return NextResponse.json({ error: "Invalid customer" }, { status: 400 });
  }
  try {
    const customer = await getCustomerDetailForOwner(session.userId, decoded);
    if (!customer) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ customer });
  } catch (e) {
    console.error("[Customers] detail failed", e);
    return NextResponse.json(
      { error: "Could not load customer" },
      { status: 500 }
    );
  }
}
