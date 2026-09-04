import { NextResponse } from "next/server";
import { releaseExpiredOrderReservations } from "@/lib/server/repo";

/**
 * Protected cleanup job for expired stock reservations.
 * Authorize with Authorization: Bearer $CRON_SECRET
 */
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) {
    return NextResponse.json(
      { error: "Cron is not configured" },
      { status: 503 }
    );
  }

  const auth = req.headers.get("authorization") || "";
  const bearer = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (bearer !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await releaseExpiredOrderReservations(100);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "cleanup_failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET(req: Request) {
  return POST(req);
}
