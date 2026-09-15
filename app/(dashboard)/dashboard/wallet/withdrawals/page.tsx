"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Wd = {
  id: number;
  amountKobo: number;
  status: string;
  statusLabel?: string;
  statusExplanation?: string;
  reference: string;
  bankName?: string | null;
  accountLast4?: string | null;
  failureReason?: string | null;
  createdAt: string;
};

function formatNgn(kobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

export default function WithdrawalsPage() {
  const [rows, setRows] = useState<Wd[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (cursor?: number | null) => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ limit: "30" });
        if (cursor) params.set("cursor", String(cursor));
        if (filter) params.set("status", filter);
        const res = await fetch(`/api/wallet/withdrawals?${params}`);
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || "Failed");
        setRows((prev) => (cursor ? [...prev, ...(j.withdrawals || [])] : j.withdrawals || []));
        setNextCursor(j.nextCursor ?? null);
      } catch (e) {
        setError(String((e as Error).message));
      } finally {
        setLoading(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/dashboard/wallet" className="text-sm text-ink-600 underline">
          ← Wallet
        </Link>
        <h1 className="text-xl font-semibold">Withdrawals</h1>
        <select
          className="ml-auto rounded border px-2 py-1 text-sm"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All statuses</option>
          <option value="processing">Processing</option>
          <option value="provider_unknown">Verifying</option>
          <option value="success">Successful</option>
          <option value="failed">Failed</option>
          <option value="reversed">Reversed</option>
        </select>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y rounded-xl border border-ink-100 bg-white">
        {rows.map((w) => (
          <li key={w.id} className="px-4 py-3 text-sm">
            <div className="flex justify-between gap-3">
              <Link href={`/dashboard/wallet/withdrawals/${w.id}`} className="font-medium hover:underline">
                {formatNgn(w.amountKobo)}
              </Link>
              <span className="text-ink-600">{w.statusLabel || w.status}</span>
            </div>
            <p className="text-ink-500">
              {w.bankName ? `${w.bankName} · ****${w.accountLast4}` : "—"} · {w.reference}
            </p>
            {w.statusExplanation && <p className="mt-1 text-xs text-ink-400">{w.statusExplanation}</p>}
            {w.failureReason && w.status === "failed" && (
              <p className="mt-1 text-xs text-red-600">{w.failureReason}</p>
            )}
          </li>
        ))}
        {!loading && rows.length === 0 && <li className="px-4 py-8 text-center text-ink-500">No withdrawals.</li>}
      </ul>
      {nextCursor != null && (
        <button type="button" className="rounded border px-3 py-2 text-sm" disabled={loading} onClick={() => void load(nextCursor)}>
          Load more
        </button>
      )}
    </div>
  );
}
