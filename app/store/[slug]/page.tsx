import { notFound } from "next/navigation";
import { getStoreBySlug, listProducts } from "@/lib/server/repo";
import { Storefront } from "@/components/Storefront";

export default async function PublicStorePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
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
        phone: store.phone,
        whatsapp: store.whatsapp,
      }}
      products={products}
    />
  );
}
