"use client";
import { useCallback, useEffect, useState } from "react";

type Plan = {
  id: number; name: string; slug: string; description: string; priceKobo: number;
  billingInterval: string; productLimit: number | null;
  features: Record<string, boolean>;
};
type Summary = {
  subscription: {
    status: string; cancelAtPeriodEnd: boolean;
    currentPeriodEnd: string | null;
  };
  plan: Plan; plans: Plan[];
  history: Array<{ id: number; reference: string; amountKobo: number; status: string; transactionType: string; createdAt: string }>;
};

function formatNgn(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100);
}

export default function BillingPage() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/billing");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Failed");
    setData(json);
  }, []);

  useEffect(() => { void load().catch((e) => setError(String(e.message || e))); }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const ref = new URLSearchParams(window.location.search).get("reference");
    if (!ref) return;
    (async () => {
      setBusy(true);
      try {
        const res = await fetch("/api/billing/verify", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ reference: ref }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Verify failed");
        setMessage(`Plan ${json.plan} active.`);
        window.history.replaceState({}, "", "/dashboard/billing");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Verify failed");
      } finally { setBusy(false); }
    })();
  }, [load]);

  async function checkout(planSlug: string) {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Checkout failed");
      if (json.kind === "free") { setMessage("Switched to Free."); await load(); return; }
      if (json.authorizationUrl) { window.location.href = json.authorizationUrl; return; }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Checkout failed");
    } finally { setBusy(false); }
  }

  async function cancel() {
    if (!confirm("Cancel at end of billing period?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/billing/cancel", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ immediate: false }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Cancel failed");
      setMessage("Will cancel at period end.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally { setBusy(false); }
  }

  async function resume() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/resume", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Resume failed");
      setMessage("Resumed.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resume failed");
    } finally { setBusy(false); }
  }

  if (!data && !error) return <div className="p-8 text-ink-600">Loading billing…</div>;
  if (error && !data) return <div className="p-8 text-red-600">{error}</div>;
  if (!data) return null;

  const { plan, plans, subscription, history } = data;

  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-8">
      <h1 className="text-2xl font-semibold text-ink-950">Billing</h1>
      {message && <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>}
      {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <section className="rounded-xl border border-ink-100 bg-white p-6">
        <p className="text-xs uppercase text-ink-500">Current plan</p>
        <h2 className="mt-1 text-xl font-semibold">{plan.name}</h2>
        <p className="text-sm text-ink-600">
          {plan.priceKobo === 0 ? "Free" : `${formatNgn(plan.priceKobo)} / ${plan.billingInterval}`}
          {" · "}Status: <span className="capitalize font-medium">{subscription.status}</span>
        </p>
        <div className="mt-3 flex gap-2">
          {subscription.cancelAtPeriodEnd && (
            <button type="button" disabled={busy} onClick={() => void resume()} className="rounded-lg bg-ink-900 px-4 py-2 text-sm text-white">Resume</button>
          )}
          {plan.slug !== "free" && subscription.status === "active" && !subscription.cancelAtPeriodEnd && (
            <button type="button" disabled={busy} onClick={() => void cancel()} className="rounded-lg border border-ink-200 px-4 py-2 text-sm">Cancel at period end</button>
          )}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className={`rounded-xl border bg-white p-5 ${p.slug === plan.slug ? "border-ink-900 ring-1 ring-ink-900" : "border-ink-100"}`}>
            <h3 className="font-semibold">{p.name}</h3>
            <p className="mt-1 text-xl font-semibold">{p.priceKobo === 0 ? "Free" : formatNgn(p.priceKobo)}</p>
            <p className="mt-2 text-sm text-ink-600">{p.description}</p>
            <p className="mt-2 text-sm">{p.productLimit == null ? "Unlimited products" : `Up to ${p.productLimit} products`}</p>
            <button
              type="button" disabled={busy || p.slug === plan.slug}
              onClick={() => void checkout(p.slug)}
              className="mt-4 w-full rounded-lg bg-ink-900 px-4 py-2 text-sm text-white disabled:opacity-40"
            >
              {p.slug === plan.slug ? "Current" : p.priceKobo === 0 ? "Switch to Free" : "Upgrade"}
            </button>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Billing history</h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink-500">No payments yet.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {history.map((h) => (
              <li key={h.id} className="flex justify-between border-b border-ink-50 py-2">
                <span className="font-mono text-xs">{h.reference}</span>
                <span>{formatNgn(h.amountKobo)} · {h.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
