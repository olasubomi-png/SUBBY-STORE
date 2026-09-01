import Link from "next/link";
import { notFound } from "next/navigation";
import { getStoreBySlug, listProducts } from "@/lib/server/repo";
import { formatNgn } from "@/lib/money";

export default async function ProductDetailPage({
  params,
}: {
  params: Promise<{ slug: string; productSlug: string }>;
}) {
  const { slug, productSlug } = await params;
  const store = await getStoreBySlug(slug);
  if (!store) notFound();
  const products = await listProducts(store.id, true);
  const product = products.find((p) => p.slug === productSlug);
  if (!product) notFound();

  return (
    <div className="mx-auto min-h-screen max-w-lg px-4 py-6">
      <Link href={`/store/${slug}`} className="text-sm text-brand-700">
        ← {store.name}
      </Link>
      <div className="mt-6 aspect-square rounded-xl bg-ink-100" />
      <h1 className="mt-4 text-2xl font-semibold text-ink-950">{product.name}</h1>
      <p className="mt-2 text-xl font-semibold tabular-nums">
        {formatNgn(product.priceKobo)}
      </p>
      <p className="mt-2 text-sm text-ink-500">
        {product.stock > 0 ? `${product.stock} in stock` : "Out of stock"}
      </p>
      {product.description && (
        <p className="mt-4 text-sm leading-relaxed text-ink-700">
          {product.description}
        </p>
      )}
    </div>
  );
}
