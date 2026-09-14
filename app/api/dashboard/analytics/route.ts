import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  getSellerAnalytics,
  resolveAnalyticsPeriod,
} from "@/lib/server/analytics";
import { getConversionMetrics } from "@/lib/server/conversion-analytics";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const url = new URL(req.url);
    const period = resolveAnalyticsPeriod(url.searchParams.get("period"));
    const [analytics, conversion] = await Promise.all([
      getSellerAnalytics(session.userId, period),
      getConversionMetrics(session.userId, period),
    ]);
    return NextResponse.json({ analytics, conversion });
  } catch (error) {
    console.error("[Analytics] Failed to load", error);
    return NextResponse.json(
      { error: "Could not load analytics" },
      { status: 500 }
    );
  }
}
