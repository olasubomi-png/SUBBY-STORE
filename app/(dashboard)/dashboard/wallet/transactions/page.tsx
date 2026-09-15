"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Tx = {
  id: number;
  entryType: string;
  direction: string;
  amountKobo: number;
  description?: string;
  orderId: number | null;
  reference: string;
  createdAt: string;
};

function formatNgn(kobo: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(kobo / 100);
}

export default function WalletTransactionsPage() {
  const [txs, setTxs] = useState<Tx[]>([]);
  const [nextCursor, setNextCursor] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (cursor?: number | null) => {
    setLoading(true);
    try {
      const q = cursor ? `?limit=30&cursor=${cursor}` : "?limit=30";
      const res = await fetch(`/api/wallet/transactions${q}`);
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed");
      setTxs((prev) => (cursor ? [...prev, ...(j.transactions || [])] : j.transactions || []));
      setNextCursor(j.nextCursor ?? null);
    } catch (e) {
      setError(String((e as Error).message));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/wallet" className="text-sm text-ink-600 underline">
          ← Wallet
        </Link>
        <h1 className="text-xl font-semibold">Transaction history</h1>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <ul className="divide-y rounded-xl border border-ink-100 bg-white">
        {txs.map((tx) => (
          <li key={tx.id} className="flex justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">
                {tx.direction === "credit" ? "+" : "−"} {formatNgn(tx.amountKobo)}
              </p>
              <p className="text-ink-500">{tx.description || tx.entryType}</p>
              <p className="text-xs text-ink-400">{tx.reference}</p>
            </div>
            <time className="text-xs text-ink-400">{new Date(tx.createdAt).toLocaleString()}</time>
          </li>
        ))}
        {!loading && txs.length === 0 && <li className="px-4 py-8 text-center text-ink-500">No transactions.</li>}
      </ul>
      {nextCursor != null && (
        <button
          type="button"
          className="rounded border px-3 py-2 text-sm"
          disabled={loading}
          onClick={() => void load(nextCursor)}
        >
          Load more
        </button>
      )}
    </div>
  );
}
