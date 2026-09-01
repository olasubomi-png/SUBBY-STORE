import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { dashboardStats, listStoresForOwner } from "@/lib/server/repo";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const stats = await dashboardStats(session.userId);
  const stores = await listStoresForOwner(session.userId);
  return NextResponse.json({ stats, stores });
}
