"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Detail = {
  id: number;
  amountFormatted: string;
  status: string;
  statusLabel: string;
  statusExplanation: string;
  reference: string;
  bankName: string | null;
  accountLast4: string | null;
  accountName: string | null;
  failureReason: string | null;
  timeline: Array<{ label: string; at: string | null }>;
};

export default function WithdrawalDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const res = await fetch(`/api/wallet/withdrawals/${id}`);
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || "Not found");
    setDetail(j);
  }, [id]);

  useEffect(() => {
    void load().catch((e) => setError(String(e.message || e)));
  }, [load]);

  async function verify() {
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/wallet/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "verify_withdrawal", reference: detail.reference }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Verify failed");
      setMessage(`Status: ${j.status}`);
      await load();
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setBusy(false);
    }
  }

  if (!detail && !error) return <div className="p-8">Loading…</div>;
  if (!detail) return <div className="p-8 text-red-600">{error}</div>;

  return (
    <div className="mx-auto max-w-lg space-y-6 px-4 py-8">
      <Link href="/dashboard/wallet/withdrawals" className="text-sm text-ink-600 underline">
        ← Withdrawals
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">Withdrawal #{detail.id}</h1>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{detail.amountFormatted}</p>
        <p className="mt-2 font-medium text-ink-800">{detail.statusLabel}</p>
        {detail.statusExplanation && <p className="mt-1 text-sm text-ink-500">{detail.statusExplanation}</p>}
      </div>
      {message && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      <dl className="space-y-2 rounded-xl border border-ink-100 bg-white p-4 text-sm">
        <div className="flex justify-between gap-2">
          <dt className="text-ink-500">Bank</dt>
          <dd>{detail.bankName || "—"}</dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-500">Account</dt>
          <dd>
            {detail.accountLast4 ? `****${detail.accountLast4}` : "—"}
            {detail.accountName ? ` · ${detail.accountName}` : ""}
          </dd>
        </div>
        <div className="flex justify-between gap-2">
          <dt className="text-ink-500">Reference</dt>
          <dd className="font-mono text-xs">{detail.reference}</dd>
        </div>
        {detail.failureReason && detail.status === "failed" && (
          <div className="flex justify-between gap-2">
            <dt className="text-ink-500">Reason</dt>
            <dd className="text-red-700">{detail.failureReason}</dd>
          </div>
        )}
      </dl>
      <div>
        <h2 className="mb-2 font-semibold">Timeline</h2>
        <ol className="space-y-2 border-l-2 border-ink-100 pl-4 text-sm">
          {detail.timeline.map((t, i) => (
            <li key={i}>
              <p className="font-medium">{t.label}</p>
              <p className="text-ink-500">{t.at === "Pending" ? "Pending" : t.at ? new Date(t.at).toLocaleString() : "—"}</p>
            </li>
          ))}
        </ol>
      </div>
      {(detail.status === "provider_unknown" || detail.status === "processing") && (
        <button
          type="button"
          disabled={busy}
          className="rounded bg-ink-900 px-3 py-2 text-sm text-white disabled:opacity-40"
          onClick={() => void verify()}
        >
          Check provider status
        </button>
      )}
    </div>
  );
}
