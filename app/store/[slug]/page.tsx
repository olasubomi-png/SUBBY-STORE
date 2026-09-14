import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug, listProducts } from "@/lib/server/repo";
import { listPublicStorePromotions } from "@/lib/server/public-promotions";
import { resolveStoreSeo } from "@/lib/storefront/seo";
import { Storefront } from "@/components/Storefront";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) return { title: "Store not found" };

  const seo = resolveStoreSeo(store as Parameters<typeof resolveStoreSeo>[0], process.env.APP_URL);

  return {
    title: seo.title,
    description: seo.description,
    keywords: seo.keywords,
    alternates: seo.canonical ? { canonical: seo.canonical } : undefined,
    openGraph: {
      title: seo.ogTitle,
      description: seo.ogDescription,
      type: "website",
      url: seo.canonical,
      ...(seo.ogImage ? { images: [{ url: seo.ogImage }] } : {}),
    },
    twitter: {
      card: seo.ogImage ? "summary_large_image" : "summary",
      title: seo.ogTitle,
      description: seo.ogDescription,
      ...(seo.ogImage ? { images: [seo.ogImage] } : {}),
    },
  };
}

export default async function PublicStorePage({ params }: Props) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const [productRows, promotions] = await Promise.all([
    listProducts(store.id, true),
    listPublicStorePromotions(store.id),
  ]);
  const products = productRows.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    priceKobo: p.priceKobo,
    stock: p.stock,
    imageUrl: p.imageUrl,
    category: p.category || "General",
    featured: Boolean((p as { featured?: boolean }).featured),
    createdAt: p.createdAt,
  }));

  return (
    <Storefront
      store={{
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
      }}
      products={products}
      promotions={promotions}
    />
  );
}
