import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  addProductImage,
  deleteProductImage,
  getProductOwned,
  listProductImages,
  reorderProductImages,
} from "@/lib/server/repo";
import {
  blobBelongsToUser,
  deleteManagedBlob,
  isManagedBlobUrl,
} from "@/lib/server/blob";

const MAX_IMAGES = 12;

/** GET ?productId= — list gallery for an owned product */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const productId = Number(new URL(req.url).searchParams.get("productId"));
  if (!Number.isSafeInteger(productId) || productId <= 0) {
    return NextResponse.json({ error: "productId required" }, { status: 400 });
  }
  try {
    await getProductOwned(productId, session.userId);
    const images = await listProductImages(productId);
    return NextResponse.json({ images });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}

/**
 * POST — add image URL to product gallery
 * body: { productId, imageUrl }
 * Upload file first via /api/uploads/product, then register here.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const productId = Number(body.productId);
    const imageUrl =
      typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
    if (!imageUrl || !imageUrl.startsWith("https://")) {
      return NextResponse.json(
        { error: "Valid https imageUrl required" },
        { status: 400 }
      );
    }
    // Only accept managed blob URLs for this seller
    if (
      !isManagedBlobUrl(imageUrl) ||
      !blobBelongsToUser(imageUrl, session.userId)
    ) {
      return NextResponse.json(
        { error: "Image must be an uploaded product asset" },
        { status: 400 }
      );
    }
    const existing = await listProductImages(productId);
    if (existing.length >= MAX_IMAGES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_IMAGES} images per product` },
        { status: 400 }
      );
    }
    const image = await addProductImage(session.userId, productId, imageUrl);
    const images = await listProductImages(productId);
    return NextResponse.json({ image, images });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status =
      msg.includes("not found") || msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: status });
  }
}

/**
 * PATCH — reorder gallery (first id becomes primary)
 * body: { productId, orderedImageIds: number[] }
 */
export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const productId = Number(body.productId);
    const orderedImageIds = Array.isArray(body.orderedImageIds)
      ? body.orderedImageIds.map((x: unknown) => Number(x))
      : [];
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
    if (
      orderedImageIds.length === 0 ||
      orderedImageIds.some((id: number) => !Number.isSafeInteger(id) || id <= 0)
    ) {
      return NextResponse.json(
        { error: "orderedImageIds required" },
        { status: 400 }
      );
    }
    const images = await reorderProductImages(
      session.userId,
      productId,
      orderedImageIds
    );
    return NextResponse.json({ images });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status =
      msg.includes("not found") || msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: status });
  }
}

/**
 * DELETE ?imageId= — remove one gallery image and managed blob when safe
 */
export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const imageId = Number(new URL(req.url).searchParams.get("imageId"));
    if (!Number.isSafeInteger(imageId) || imageId <= 0) {
      return NextResponse.json({ error: "Invalid image" }, { status: 400 });
    }
    const result = await deleteProductImage(session.userId, imageId);
    const url = result.deleted.imageUrl;
    if (
      isManagedBlobUrl(url) &&
      blobBelongsToUser(url, session.userId)
    ) {
      try {
        await deleteManagedBlob(url, session.userId);
      } catch {
        /* best-effort after DB delete */
      }
    }
    const images = await listProductImages(result.productId);
    return NextResponse.json({ ok: true, images });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status =
      msg.includes("not found") || msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status: status });
  }
}
