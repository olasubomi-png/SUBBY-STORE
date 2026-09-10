import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  blobBelongsToUser,
  isManagedBlobUrl,
  tryDeleteManagedBlob,
} from "@/lib/server/blob";

/**
 * Best-effort cleanup of orphaned managed product Blobs after a failed
 * product create / gallery registration. Never deletes foreign or unmanaged URLs.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const urls = Array.isArray(body.urls) ? body.urls : [];
    let deleted = 0;
    for (const raw of urls) {
      if (typeof raw !== "string") continue;
      const url = raw.trim();
      if (!isManagedBlobUrl(url) || !blobBelongsToUser(url, session.userId)) {
        continue;
      }
      if (await tryDeleteManagedBlob(url, session.userId)) deleted += 1;
    }
    return NextResponse.json({ ok: true, deleted });
  } catch {
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}
