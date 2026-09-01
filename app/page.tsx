import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <span className="text-lg font-semibold tracking-tight text-ink-950">
            SUBBY STORE
          </span>
          <div className="flex items-center gap-3 text-sm">
            <Link href="/login" className="text-ink-700 hover:text-ink-950">
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-3 py-2 font-medium text-white hover:bg-brand-700"
            >
              Create your store
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-5xl px-4 py-16 sm:py-24">
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-ink-950 sm:text-5xl">
            Your business. Your online store.
          </h1>
          <p className="mt-4 max-w-xl text-lg text-ink-500">
            Create your online store, sell your products and accept payments —
            without needing a website developer.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/signup"
              className="rounded-lg bg-brand-600 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              Create your store
            </Link>
            <Link
              href="/store/demo-fashion"
              className="rounded-lg border border-ink-200 bg-white px-5 py-3 text-sm font-semibold text-ink-800 hover:bg-ink-100"
            >
              View demo
            </Link>
          </div>
        </section>

        <section className="border-t border-ink-100 bg-white py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-semibold text-ink-950">How it works</h2>
            <ol className="mt-8 grid gap-6 sm:grid-cols-3">
              {[
                {
                  step: "1",
                  title: "Create your store",
                  body: "Sign up and set your store name, phone and WhatsApp.",
                },
                {
                  step: "2",
                  title: "Add products",
                  body: "Upload products with prices and stock in minutes.",
                },
                {
                  step: "3",
                  title: "Get paid",
                  body: "Share your link. Customers pay securely with Paystack.",
                },
              ].map((item) => (
                <li
                  key={item.step}
                  className="rounded-xl border border-ink-100 p-5"
                >
                  <span className="text-sm font-medium text-brand-600">
                    Step {item.step}
                  </span>
                  <h3 className="mt-2 font-semibold text-ink-950">
                    {item.title}
                  </h3>
                  <p className="mt-1 text-sm text-ink-500">{item.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-semibold text-ink-950">Features</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                "Mobile-first storefront for Nigerian customers",
                "Products, stock and prices under your control",
                "Guest checkout — no customer account required",
                "Paystack payments in NGN",
                "Orders dashboard for your business",
                "Server-side pricing — customers cannot alter totals",
              ].map((f) => (
                <li
                  key={f}
                  className="rounded-lg border border-ink-100 bg-white px-4 py-3 text-sm text-ink-700"
                >
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-t border-ink-100 bg-white py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-semibold text-ink-950">Pricing</h2>
            <p className="mt-3 max-w-xl text-ink-500">
              V1 is free to try while we refine the product. Paystack transaction
              fees apply to customer payments as charged by Paystack.
            </p>
          </div>
        </section>

        <section className="py-14">
          <div className="mx-auto max-w-5xl px-4">
            <h2 className="text-2xl font-semibold text-ink-950">FAQ</h2>
            <dl className="mt-6 space-y-4">
              <div className="rounded-lg border border-ink-100 bg-white p-4">
                <dt className="font-medium text-ink-950">
                  Do customers need an account?
                </dt>
                <dd className="mt-1 text-sm text-ink-500">
                  No. They browse, checkout and pay without signing up.
                </dd>
              </div>
              <div className="rounded-lg border border-ink-100 bg-white p-4">
                <dt className="font-medium text-ink-950">
                  What currency is supported?
                </dt>
                <dd className="mt-1 text-sm text-ink-500">
                  Nigerian Naira (NGN) via Paystack.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="border-t border-ink-100 bg-ink-950 py-14 text-center">
          <h2 className="text-2xl font-semibold text-white">
            Ready to open your store?
          </h2>
          <Link
            href="/signup"
            className="mt-6 inline-block rounded-lg bg-brand-500 px-5 py-3 text-sm font-semibold text-white hover:bg-brand-600"
          >
            Create your store
          </Link>
        </section>
      </main>

      <footer className="border-t border-ink-100 py-6 text-center text-xs text-ink-400">
        SUBBY STORE · Built for Nigerian small businesses
      </footer>
    </div>
  );
}
