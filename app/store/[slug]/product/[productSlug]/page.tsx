import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreBySlug, listProducts } from "@/lib/server/repo";
import { formatNgn } from "@/lib/money";
import { relatedProducts } from "@/lib/storefront/discovery";
import { ProductCard } from "@/components/ProductCard";

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
        <Link href={`/store/${slug}`} className="text-sm font-medium text-brand-700">
          ← {store.name}
        </Link>

        <div className="mt-6 overflow-hidden rounded-2xl border border-ink-100 bg-white shadow-sm">
          <div className="aspect-square bg-ink-100">
            {product.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={product.imageUrl}
                alt={product.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-sm text-ink-400">
                No product image
              </div>
            )}
          </div>
          <div className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
                {product.category || "General"}
              </p>
              {product.featured ? (
                <span className="rounded-full bg-brand-600/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-brand-700">
                  Featured
                </span>
              ) : null}
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-ink-950">
              {product.name}
            </h1>
            <p className="mt-2 text-xl font-semibold tabular-nums text-ink-950">
              {formatNgn(product.priceKobo)}
            </p>
            <p className="mt-2 text-sm text-ink-500">
              {product.stock > 0 ? "In stock" : "Out of stock"}
            </p>
            {product.description ? (
              <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-700">
                {product.description}
              </p>
            ) : null}
          </div>
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
