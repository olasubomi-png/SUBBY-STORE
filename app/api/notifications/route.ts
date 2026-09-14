import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  listNotificationsForOwner,
  markAllNotificationsRead,
} from "@/lib/server/notifications";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const url = new URL(req.url);
    const limit = Number(url.searchParams.get("limit") || 30);
    const offset = Number(url.searchParams.get("offset") || 0);
    const unreadOnly = url.searchParams.get("unreadOnly") === "1";
    const result = await listNotificationsForOwner(session.userId, {
      limit: Number.isFinite(limit) ? limit : 30,
      offset: Number.isFinite(offset) ? offset : 0,
      unreadOnly,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[notifications] list", e);
    return NextResponse.json(
      { error: "Could not load notifications" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    if (body.markAllRead === true) {
      const count = await markAllNotificationsRead(session.userId);
      return NextResponse.json({ ok: true, marked: count });
    }
    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
