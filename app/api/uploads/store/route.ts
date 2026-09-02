import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import { getStoreOwned } from "@/lib/server/repo";

const MAX = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "");
    const storeId = Number(form.get("storeId"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Image is required" }, { status: 400 });
    }
    if (kind !== "logo" && kind !== "banner") {
      return NextResponse.json(
        { error: "kind must be logo or banner" },
        { status: 400 }
      );
    }
    if (!Number.isSafeInteger(storeId) || storeId <= 0) {
      return NextResponse.json({ error: "Invalid storeId" }, { status: 400 });
    }

    await getStoreOwned(storeId, session.userId);

    if (!ALLOWED.has(file.type)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, and WebP images are allowed" },
        { status: 400 }
      );
    }
    if (file.size <= 0 || file.size > MAX) {
      return NextResponse.json(
        { error: "Image must be 5MB or smaller" },
        { status: 400 }
      );
    }

    const extension =
      file.type === "image/jpeg"
        ? "jpg"
        : file.type === "image/png"
          ? "png"
          : "webp";

    const pathname = `stores/${session.userId}/${kind}/${crypto.randomUUID()}.${extension}`;

    const blob = await put(pathname, file, {
      access: "public",
      addRandomSuffix: false,
      contentType: file.type,
    });

    return NextResponse.json({ url: blob.url, kind });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    const status =
      msg.includes("not found") || msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
