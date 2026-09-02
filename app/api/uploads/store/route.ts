import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  replaceStoreBrandingImage,
  type BrandingKind,
} from "@/lib/server/storeBranding";

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") || "") as BrandingKind;
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

    const result = await replaceStoreBrandingImage({
      userId: session.userId,
      storeId,
      kind,
      file,
    });

    return NextResponse.json({
      url: result.url,
      kind,
      store: result.store,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed";
    let status = 400;
    if (msg.includes("not found") || msg.includes("Forbidden")) status = 403;
    // Do not leak internal stack/details
    const safe =
      msg.includes("Only JPG") ||
      msg.includes("5MB") ||
      msg.includes("kind must") ||
      msg.includes("required") ||
      msg.includes("Invalid") ||
      msg.includes("Forbidden") ||
      msg.includes("not found")
        ? msg
        : "Failed to upload branding image";
    return NextResponse.json({ error: safe }, { status });
  }
}
