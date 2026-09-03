import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreBySlug, listProducts } from "@/lib/server/repo";
import { relatedProducts } from "@/lib/storefront/discovery";
import { ProductCard } from "@/components/ProductCard";
import { ProductPurchase } from "@/components/ProductPurchase";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  const { slug, productSlug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();

  const active = await listProducts(store.id, true);
  const catalog = active.map((p) => ({
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

  const product = catalog.find((p) => p.slug === productSlug);
  if (!product) notFound();

  const related = relatedProducts(catalog, product, 4);

  return (
    <div className="min-h-screen bg-ink-50 pb-12">
      <div className="mx-auto max-w-lg px-4 py-6">
        <Link
          href={`/store/${slug}`}
          className="text-sm font-medium text-brand-700"
        >
          ← {store.name}
        </Link>

        <div className="mt-6 rounded-2xl border border-ink-100 bg-white p-4 shadow-sm sm:p-5">
          <ProductPurchase
            storeSlug={slug}
            storeName={store.name}
            product={{
              id: product.id,
              name: product.name,
              description: product.description,
              priceKobo: product.priceKobo,
              stock: product.stock,
              category: product.category,
              featured: product.featured,
              imageUrl: product.imageUrl,
            }}
          />
        </div>

        {related.length > 0 ? (
          <section className="mt-10">
            <h2 className="text-sm font-semibold text-ink-900">
              Related products
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-3">
              {related.map((p) => (
                <ProductCard key={p.id} product={p} storeSlug={slug} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
