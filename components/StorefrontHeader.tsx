export type StorefrontHeaderProps = {
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  bannerUrl?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  instagramUrl?: string | null;
  facebookUrl?: string | null;
  twitterUrl?: string | null;
  tiktokUrl?: string | null;
};

function SocialLink({
  href,
  label,
}: {
  href: string;
  label: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-xs font-medium text-ink-600 underline-offset-2 hover:underline"
    >
      {label}
    </a>
  );
}

export function StorefrontHeader(store: StorefrontHeaderProps) {
  const socials: { href: string; label: string }[] = [];
  if (store.instagramUrl)
    socials.push({ href: store.instagramUrl, label: "Instagram" });
  if (store.facebookUrl)
    socials.push({ href: store.facebookUrl, label: "Facebook" });
  if (store.twitterUrl)
    socials.push({ href: store.twitterUrl, label: "X" });
  if (store.tiktokUrl)
    socials.push({ href: store.tiktokUrl, label: "TikTok" });

  return (
    <header className="bg-white">
      {store.bannerUrl ? (
        <div className="aspect-[3/1] w-full overflow-hidden bg-ink-100 sm:aspect-[4/1]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={store.bannerUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        </div>
      ) : (
        <div className="h-16 bg-gradient-to-r from-ink-100 to-ink-50 sm:h-20" />
      )}

      <div className="mx-auto max-w-3xl px-4 pb-5 pt-4">
        <div className="flex flex-col items-center text-center sm:flex-row sm:items-end sm:gap-4 sm:text-left">
          <div className="-mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-2xl border-4 border-white bg-ink-100 shadow-sm sm:-mt-12 sm:h-24 sm:w-24">
            {store.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={store.logoUrl}
                alt={store.name}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full items-center justify-center text-lg font-semibold text-ink-400">
                {store.name.slice(0, 1).toUpperCase()}
              </div>
            )}
          </div>
          <div className="mt-3 min-w-0 flex-1 sm:mt-0 sm:pb-1">
            <h1 className="text-xl font-semibold tracking-tight text-ink-950 sm:text-2xl">
              {store.name}
            </h1>
            {store.description ? (
              <p className="mt-1 text-sm leading-relaxed text-ink-600 line-clamp-3">
                {store.description}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 sm:justify-start">
          {store.whatsapp ? (
            <a
              href={`https://wa.me/${store.whatsapp.replace(/\D/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-brand-700"
            >
              WhatsApp
            </a>
          ) : null}
          {store.phone ? (
            <a
              href={`tel:${store.phone}`}
              className="text-xs font-medium text-ink-600"
            >
              Call
            </a>
          ) : null}
          {store.email ? (
            <a
              href={`mailto:${store.email}`}
              className="text-xs font-medium text-ink-600"
            >
              Email
            </a>
          ) : null}
          {socials.map((s) => (
            <SocialLink key={s.label} href={s.href} label={s.label} />
          ))}
        </div>
      </div>
      <div className="border-b border-ink-100" />
    </header>
  );
}
