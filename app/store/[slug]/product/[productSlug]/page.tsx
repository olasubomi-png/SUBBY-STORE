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
      <div className="mt-6 aspect-square overflow-hidden rounded-xl bg-ink-100">
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
      <p className="mt-4 text-xs font-medium uppercase tracking-wide text-ink-400">
        {product.category || "General"}
      </p>
      <h1 className="mt-1 text-2xl font-semibold text-ink-950">{product.name}</h1>
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
  );
}
