import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import {
  createProduct,
  listProducts,
  updateProduct,
  deleteProduct,
  getStoreOwned,
} from "@/lib/server/repo";
import { ngnMajorToKobo } from "@/lib/money";

const createSchema = z.object({
  storeId: z.number().int().positive(),
  name: z.string().min(1).max(160),
  description: z.string().max(4000).optional(),
  priceNgn: z.number().positive(),
  stock: z.number().int().min(0),
  category: z.string().max(80).optional(),
  imageUrl: z.string().url().optional().or(z.literal("")),
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const storeId = Number(new URL(req.url).searchParams.get("storeId"));
  if (!Number.isSafeInteger(storeId)) {
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
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid product data" }, { status: 400 });
    }
    const priceKobo = ngnMajorToKobo(parsed.data.priceNgn);
    const product = await createProduct({
      ownerId: session.userId,
      storeId: parsed.data.storeId,
      name: parsed.data.name,
      description: parsed.data.description,
      priceKobo,
      stock: parsed.data.stock,
      category: parsed.data.category,
      imageUrl: parsed.data.imageUrl || undefined,
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
    const productId = Number(body.productId);
    if (!Number.isSafeInteger(productId)) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) patch.name = body.name;
    if (body.description !== undefined) patch.description = body.description;
    if (body.priceNgn !== undefined) patch.priceKobo = ngnMajorToKobo(Number(body.priceNgn));
    if (body.stock !== undefined) patch.stock = Number(body.stock);
    if (body.category !== undefined) patch.category = body.category;
    if (body.imageUrl !== undefined) patch.imageUrl = body.imageUrl;
    if (body.active !== undefined) patch.active = Boolean(body.active);
    const product = await updateProduct(session.userId, productId, patch as never);
    return NextResponse.json({ product });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const productId = Number(new URL(req.url).searchParams.get("productId"));
    if (!Number.isSafeInteger(productId)) {
      return NextResponse.json({ error: "Invalid product" }, { status: 400 });
    }
    await deleteProduct(session.userId, productId);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
