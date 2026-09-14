import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { listCustomersForOwner } from "@/lib/server/customers";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await listCustomersForOwner(session.userId);
    return NextResponse.json(result);
  } catch (e) {
    console.error("[Customers] list failed", e);
    return NextResponse.json(
      { error: "Could not load customers" },
      { status: 500 }
    );
  }
}
