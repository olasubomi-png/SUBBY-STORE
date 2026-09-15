import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicCampaignBySlugs } from "@/lib/server/campaigns";
import { formatNgn } from "@/lib/money";
import { CampaignLandingClient } from "./CampaignLandingClient";
type Params = { slug: string; campaignSlug: string };
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug, campaignSlug } = await params;
  const data = await getPublicCampaignBySlugs(slug, campaignSlug);
  if (!data?.campaign) return { title: "Campaign not found" };
  const title = `${data.campaign.name} · ${data.store.name}`;
  const description = data.campaign.announcementText || data.campaign.description || data.store.description || undefined;
  return { title, description, openGraph: { title, description, images: data.campaign.bannerUrl ? [{ url: data.campaign.bannerUrl }] : undefined } };
}
export default async function CampaignPage({ params }: { params: Promise<Params> }) {
  const { slug, campaignSlug } = await params;
  const data = await getPublicCampaignBySlugs(slug, campaignSlug);
  if (!data) notFound();
  if (!data.campaign) {
    return (<div className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="text-xl font-semibold">Campaign unavailable</h1><p className="mt-2 text-sm text-ink-500">This promotion is not currently public.</p><Link href={`/store/${slug}`} className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm text-white">Back to store</Link></div>);
  }
  if (data.expired) {
    return (<div className="mx-auto max-w-3xl px-4 py-16 text-center"><p className="text-xs uppercase text-ink-400">{data.store.name}</p><h1 className="mt-2 text-xl font-semibold">{data.campaign.name}</h1><p className="mt-2 text-sm text-ink-500">This campaign has ended.</p><Link href={`/store/${slug}`} className="mt-6 inline-block rounded-lg bg-brand-600 px-4 py-2 text-sm text-white">View store</Link></div>);
  }
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-100 bg-white"><div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3"><Link href={`/store/${slug}`} className="font-semibold text-ink-950">{data.store.name}</Link><Link href={`/store/${slug}/cart`} className="text-sm text-ink-600">Cart</Link></div></header>
      <main className="mx-auto max-w-5xl px-4 py-6">
        {data.campaign.bannerUrl && (<div className="mb-6 overflow-hidden rounded-2xl border bg-white">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={data.campaign.bannerUrl} alt="" className="max-h-64 w-full object-cover" /></div>)}
        <div className="rounded-2xl border border-ink-100 bg-white p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Campaign</p>
          <h1 className="mt-1 text-2xl font-semibold">{data.campaign.name}</h1>
          {data.campaign.announcementText && <p className="mt-2 text-base text-ink-700">{data.campaign.announcementText}</p>}
          {data.campaign.description && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-600">{data.campaign.description}</p>}
          {data.campaign.couponCode && (<div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">Use code <span className="font-semibold">{data.campaign.couponCode}</span>{data.campaign.couponLabel ? ` — ${data.campaign.couponLabel}` : ""} at checkout</div>)}
          <CampaignLandingClient storeSlug={slug} campaignSlug={data.campaign.slug} campaignName={data.campaign.name} announcement={data.campaign.announcementText || data.campaign.description} />
        </div>
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Featured products</h2>
          {data.products.length === 0 ? (<p className="mt-3 text-sm text-ink-500">No products listed. <Link href={`/store/${slug}`} className="text-brand-700 underline">Browse the store</Link>.</p>) : (
            <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {data.products.map((p) => (
                <li key={p.id}><Link href={`/store/${slug}/product/${p.slug}`} className="block overflow-hidden rounded-xl border border-ink-100 bg-white hover:border-brand-200">
                  <div className="aspect-square bg-ink-50">{p.imageUrl ? (/* eslint-disable-next-line @next/next/no-img-element */<img src={p.imageUrl} alt="" className="h-full w-full object-cover" />) : (<div className="flex h-full items-center justify-center text-xs text-ink-300">No image</div>)}</div>
                  <div className="p-2.5"><p className="line-clamp-2 text-sm font-medium">{p.name}</p><p className="mt-1 text-sm font-semibold text-brand-700">{formatNgn(p.priceKobo)}</p></div>
                </Link></li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  );
}
