import { NextResponse } from "next/server";
import { getSession } from "@/lib/server/auth";
import {
  createProduct,
  listProducts,
  updateProduct,
  deleteProduct,
  getStoreOwned,
  getProductOwned,
  listProductImagesForProducts,
} from "@/lib/server/repo";
import {
  parseOptionalStoreId,
  resolveSellerStores,
} from "@/lib/server/store-resolve";
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


function attachImages(
  products: Array<{ id: number; imageUrl?: string | null; [k: string]: unknown }>,
  imageMap: Map<number, Array<{ imageUrl: string }>>
) {
  return products.map((p) => {
    const rows = imageMap.get(p.id) || [];
    const urls = rows.map((r) => r.imageUrl);
    if (urls.length === 0 && p.imageUrl) urls.push(p.imageUrl as string);
    return { ...p, images: urls };
  });
}

export async function GET(req: Request) {
  const preferred = parseOptionalStoreId(
    new URL(req.url).searchParams.get("storeId")
  );
  const resolved = await resolveSellerStores(preferred);
  if (!resolved.ok) {
    if (resolved.status === 401) {
      return NextResponse.json({ error: resolved.error }, { status: 401 });
    }
    if (preferred != null) {
      return NextResponse.json({ error: resolved.error }, { status: 404 });
    }
    return NextResponse.json({
      products: [],
      storeId: null,
      stores: [],
      error: resolved.error,
    });
  }

  try {
    const storeId = resolved.primary.id;
    const products = await listProducts(storeId);
    let imageMap = new Map<number, Array<{ imageUrl: string }>>();
    try {
      imageMap = await listProductImagesForProducts(products.map((p) => p.id));
    } catch (imgErr) {
      console.error("[products] image list failed", imgErr);
    }
    return NextResponse.json({
      products: attachImages(products, imageMap),
      storeId,
      stores: resolved.stores,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
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
    const imageUrls = Array.isArray(parsed.data.imageUrls)
      ? parsed.data.imageUrls
      : undefined;

    // Only accept managed Blob URLs owned by this seller
    const candidates = [
      ...(imageUrls || []),
      ...(imageUrl ? [imageUrl] : []),
    ];
    for (const url of candidates) {
      if (!isManagedBlobUrl(url) || !blobBelongsToUser(url, session.userId)) {
        return NextResponse.json(
          { error: "Product images must be uploaded assets for this account" },
          { status: 400 }
        );
      }
    }

    const product = await createProduct({
      ownerId: session.userId,
      storeId: parsed.data.storeId,
      name: parsed.data.name,
      description: parsed.data.description,
      priceKobo,
      stock: parsed.data.stock,
      category: parsed.data.category,
      imageUrl,
      imageUrls,
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
