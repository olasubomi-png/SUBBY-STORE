import { NextResponse } from "next/server";
import { getStoreBySlug, listProducts } from "@/lib/server/repo";

/**
 * Public storefront catalog — active products only.
 * No private seller credentials or internal fields.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ slug: string }> }
) {
  const { slug } = await ctx.params;
  const store = await getStoreBySlug(slug);
  if (!store) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // activeOnly=true — never expose inactive products publicly
  const products = (await listProducts(store.id, true)).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    priceKobo: p.priceKobo,
    stock: p.stock,
    imageUrl: p.imageUrl,
    category: p.category || "General",
    active: true,
    featured: Boolean((p as { featured?: boolean }).featured),
  }));

  return NextResponse.json({
    store: {
      name: store.name,
      slug: store.slug,
      description: store.description,
      logoUrl: store.logoUrl,
      bannerUrl: store.bannerUrl,
      phone: store.phone,
      whatsapp: store.whatsapp,
      email: store.email,
      instagramUrl: store.instagramUrl,
      facebookUrl: store.facebookUrl,
      twitterUrl: store.twitterUrl,
      tiktokUrl: store.tiktokUrl,
    },
    products,
  });
}
