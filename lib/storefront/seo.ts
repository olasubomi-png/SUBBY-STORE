/**
 * Build public storefront metadata from store record with SEO fallbacks.
 * Never includes private account credentials.
 */

export type StoreSeoSource = {
  name: string;
  slug: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  seoKeywords?: string | null;
  ogTitle?: string | null;
  ogDescription?: string | null;
  ogImageUrl?: string | null;
};

export function resolveStoreSeo(store: StoreSeoSource, appUrl?: string) {
  const title =
    (store.seoTitle && store.seoTitle.trim()) ||
    store.name;
  const description =
    (store.seoDescription && store.seoDescription.trim()) ||
    (store.description && store.description.trim()) ||
    `Shop ${store.name} on SUBBY-STORE`;
  const ogTitle =
    (store.ogTitle && store.ogTitle.trim()) || title;
  const ogDescription =
    (store.ogDescription && store.ogDescription.trim()) || description;
  const ogImage =
    (store.ogImageUrl && store.ogImageUrl.trim()) ||
    store.bannerUrl ||
    store.logoUrl ||
    null;
  const keywords =
    store.seoKeywords && store.seoKeywords.trim()
      ? store.seoKeywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean)
      : undefined;
  const base = (appUrl || "").replace(/\/$/, "");
  const canonical = base ? `${base}/store/${store.slug}` : undefined;

  return {
    title,
    description,
    ogTitle,
    ogDescription,
    ogImage,
    keywords,
    canonical,
  };
}
