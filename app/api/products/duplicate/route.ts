import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/server/auth";
import { duplicateProduct, getProductImageUrls } from "@/lib/server/repo";

const schema = z.object({
  productId: z.number().int().positive(),
});

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 }
    );
  }

  try {
    const product = await duplicateProduct(
      session.userId,
      parsed.data.productId
    );
    const images = await getProductImageUrls(product.id, product.imageUrl);
    return NextResponse.json({ product: { ...product, images } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Duplicate failed";
    const status = /not found/i.test(msg) ? 404 : 400;
    return NextResponse.json({ error: msg }, { status });
  }
}
