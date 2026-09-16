import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-20 border-b border-ink-100/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
          <span className="text-[15px] font-semibold tracking-tight text-ink-950">
            SUBBY STORE
          </span>
          <div className="flex items-center gap-2 text-sm">
            <Link
              href="/login"
              className="rounded-lg px-3 py-2 text-ink-600 transition hover:bg-ink-100 hover:text-ink-950"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-3.5 py-2 font-medium text-white shadow-sm transition hover:bg-brand-700"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-brand-50 via-ink-50 to-ink-50" />
          <div className="relative mx-auto max-w-5xl px-4 pb-20 pt-16 sm:pb-28 sm:pt-24">
            <p className="text-sm font-medium text-brand-700">
              Online stores for Nigerian businesses
            </p>
            <h1 className="mt-3 max-w-2xl text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl sm:leading-[1.1]">
              Sell online. Get paid. Stay in control.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-ink-500 sm:text-lg">
              Launch a mobile-ready storefront, accept Paystack payments in NGN,
              and manage orders from one dashboard.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link
                href="/signup"
                className="inline-flex items-center justify-center rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
              >
                Create your store
              </Link>
              <Link
                href="/store/demo-fashion"
                className="inline-flex items-center justify-center rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm font-semibold text-ink-800 shadow-sm transition hover:bg-ink-50"
              >
                View demo
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-ink-100 bg-white py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-xl font-semibold tracking-tight text-ink-950 sm:text-2xl">
              How it works
            </h2>
            <ol className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                {
                  step: "01",
                  title: "Create your store",
                  body: "Sign up and set your brand details.",
                },
                {
                  step: "02",
                  title: "Add products",
                  body: "List items with prices and stock.",
                },
                {
                  step: "03",
                  title: "Share & get paid",
                  body: "Customers checkout with Paystack.",
                },
              ].map((item) => (
                <li
                  key={item.step}
                  className="rounded-2xl border border-ink-100 bg-ink-50/50 p-5"
                >
                  <span className="text-xs font-semibold tracking-wide text-brand-600">
                    {item.step}
                  </span>
                  <h3 className="mt-2 text-base font-semibold text-ink-950">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-500">
                    {item.body}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-16">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-xl font-semibold tracking-tight text-ink-950 sm:text-2xl">
              Built for selling
            </h2>
            <ul className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                "Mobile-first storefront",
                "Products, inventory & pricing",
                "Guest checkout",
                "Paystack payments (NGN)",
                "Orders & customer tools",
                "Wallet withdrawals for sellers",
              ].map((f) => (
                <li
                  key={f}
                  className="flex items-center gap-3 rounded-xl border border-ink-100 bg-white px-4 py-3.5 text-sm font-medium text-ink-800 shadow-sm"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700">
                    ✓
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-ink-100 bg-white py-14">
          <div className="mx-auto max-w-5xl px-4 text-center">
            <h2 className="text-xl font-semibold tracking-tight text-ink-950 sm:text-2xl">
              Ready when you are
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
              Create an account and open your store in minutes.
            </p>
            <Link
              href="/signup"
              className="mt-6 inline-flex rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              Get started free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink-100 py-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 text-xs text-ink-400 sm:flex-row">
          <span>© {new Date().getFullYear()} SUBBY STORE</span>
          <span>Payments powered by Paystack</span>
        </div>
      </footer>
    </div>
  );
}
