import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getStoreBySlug, listProducts } from "@/lib/server/repo";
import { Storefront } from "@/components/Storefront";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) {
    return { title: "Store not found" };
  }
  const description =
    store.description?.trim() ||
    `Shop ${store.name} on SUBBY-STORE`;
  return {
    title: store.name,
    description,
    openGraph: {
      title: store.name,
      description,
      ...(store.logoUrl ? { images: [{ url: store.logoUrl }] } : {}),
    },
  };
}

export default async function PublicStorePage({ params }: Props) {
  const { slug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const products = (await listProducts(store.id, true)).map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    priceKobo: p.priceKobo,
    stock: p.stock,
    imageUrl: p.imageUrl,
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
    />
  );
}
