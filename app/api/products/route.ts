import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  createProduct,
  listProducts,
  updateProduct,
  deleteProduct,
  getStoreOwned,
  getProductOwned,
} from "@/lib/server/repo";
import { ngnMajorToKobo } from "@/lib/money";
import {
  createProductSchema,
  patchProductSchema,
} from "@/lib/products/schema";
import {
  blobBelongsToUser,
  deleteManagedBlob,
  isManagedBlobUrl,
} from "@/lib/server/blob";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const storeId = Number(new URL(req.url).searchParams.get("storeId"));
  if (!Number.isSafeInteger(storeId) || storeId <= 0) {
    return NextResponse.json({ error: "storeId required" }, { status: 400 });
  }
  try {
    await getStoreOwned(storeId, session.userId);
    const products = await listProducts(storeId);
    return NextResponse.json({ products });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 403 });
  }
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid product data" },
        { status: 400 }
      );
    }
    const priceKobo = ngnMajorToKobo(parsed.data.priceNgn);
    const imageUrl =
      parsed.data.imageUrl && parsed.data.imageUrl !== ""
        ? parsed.data.imageUrl
        : undefined;
    const product = await createProduct({
      ownerId: session.userId,
      storeId: parsed.data.storeId,
      name: parsed.data.name,
      description: parsed.data.description,
      priceKobo,
      stock: parsed.data.stock,
      category: parsed.data.category,
      imageUrl,
    });
    return NextResponse.json({ product });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const parsed = patchProductSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message || "Invalid product data" },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const existing = await getProductOwned(data.productId, session.userId);

    const patch: {
      name?: string;
      description?: string;
      priceKobo?: number;
      stock?: number;
      category?: string;
      imageUrl?: string | null;
      active?: boolean;
      featured?: boolean;
    } = {};

    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.priceNgn !== undefined) {
      patch.priceKobo = ngnMajorToKobo(data.priceNgn);
    }
    if (data.stock !== undefined) patch.stock = data.stock;
    if (data.category !== undefined) patch.category = data.category;
    if (data.active !== undefined) patch.active = data.active;
    if (data.featured !== undefined) patch.featured = data.featured;
    if (data.imageUrl !== undefined) {
      patch.imageUrl =
        data.imageUrl === "" || data.imageUrl === null ? null : data.imageUrl;
    }

    const product = await updateProduct(session.userId, data.productId, patch);

    // After successful update, delete previous managed blob on replace/clear
    if (
      data.imageUrl !== undefined &&
      existing.imageUrl &&
      existing.imageUrl !== product.imageUrl &&
      isManagedBlobUrl(existing.imageUrl) &&
      blobBelongsToUser(existing.imageUrl, session.userId)
    ) {
      try {
        await deleteManagedBlob(existing.imageUrl, session.userId);
      } catch {
        /* best-effort */
      }
    }

    return NextResponse.json({ product });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    const status =
      msg.includes("not found") || msg.includes("Forbidden") ? 403 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const productId = Number(new URL(req.url).searchParams.get("productId"));
    if (!Number.isSafeInteger(productId) || productId <= 0) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
    const existing = await getProductOwned(productId, session.userId);
    await deleteProduct(session.userId, productId);
    if (
      existing.imageUrl &&
      isManagedBlobUrl(existing.imageUrl) &&
      blobBelongsToUser(existing.imageUrl, session.userId)
    ) {
      try {
        await deleteManagedBlob(existing.imageUrl, session.userId);
      } catch {
        /* best-effort */
      }
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
