import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  getSellerAnalytics,
  resolveAnalyticsPeriod,
} from "@/lib/server/analytics";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const period = resolveAnalyticsPeriod(url.searchParams.get("period"));
    const analytics = await getSellerAnalytics(session.userId, period);
    return NextResponse.json({ analytics });
  } catch (error) {
    console.error("[Analytics] Failed to load", error);
    return NextResponse.json(
      { error: "Could not load analytics" },
      { status: 500 }
    );
  }
}
