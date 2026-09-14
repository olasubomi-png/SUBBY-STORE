import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  markNotificationRead,
  dismissNotification,
} from "@/lib/server/notifications";

export async function PATCH(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const notificationId = Number(id);
  if (!Number.isSafeInteger(notificationId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const ok = await markNotificationRead(session.userId, notificationId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const notificationId = Number(id);
  if (!Number.isSafeInteger(notificationId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const ok = await dismissNotification(session.userId, notificationId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
