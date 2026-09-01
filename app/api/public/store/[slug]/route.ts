import { NextResponse } from "next/server";
import { getStoreBySlug, listProducts } from "@/lib/server/repo";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const store = await getStoreBySlug(slug);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }
  const products = await listProducts(store.id, true);
  return NextResponse.json({
    store: {
      name: store.name,
      slug: store.slug,
      description: store.description,
    },
    products: products.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      priceKobo: p.priceKobo,
      stock: p.stock,
      imageUrl: p.imageUrl,
    })),
  });
}
