"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Summary = {
  availableKobo: number;
  pendingKobo: number;
  lifetimeEarnedKobo: number;
  lifetimeWithdrawnKobo: number;
  debtKobo: number;
  minWithdrawalKobo: number;
  canWithdraw: boolean;
  withdrawalCounts?: {
    processing: number;
    provider_unknown: number;
    failed: number;
    reversed: number;
    success: number;
  };
  formatted?: {
    available: string;
    pending: string;
    lifetimeEarned: string;
    lifetimeWithdrawn: string;
    debt: string;
    minWithdrawal: string;
  };
};

type Tx = {
  id: number;
  entryType: string;
  direction: string;
  amountKobo: number;
  description?: string;
  orderId: number | null;
  createdAt: string;
};

type Wd = {
  id: number;
  amountKobo: number;
  status: string;
  statusLabel?: string;
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

export default function WalletPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const [withdrawals, setWithdrawals] = useState<Wd[]>([]);
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [account, setAccount] = useState<{
    id: number;
    bankName: string;
    accountNumberLast4: string;
    accountName: string;
    bankCode: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [amountMajor, setAmountMajor] = useState("");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [showBank, setShowBank] = useState(false);

  const load = useCallback(async () => {
    const [s, t, w, b] = await Promise.all([
      fetch("/api/wallet").then((r) => r.json()),
      fetch("/api/wallet/transactions?limit=8").then((r) => r.json()),
      fetch("/api/wallet/withdrawals?limit=5").then((r) => r.json()),
      fetch("/api/wallet/banks").then((r) => r.json()),
    ]);
    if (s.error) throw new Error(s.error);
    setSummary(s);
    setTxs(t.transactions || []);
    setWithdrawals(w.withdrawals || []);
    setBanks(b.banks || []);
    setAccount(b.activeAccount || null);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(String(e.message || e)));
  }, [load]);

  if (!summary && !error) return <div className="p-8">Loading wallet…</div>;
  if (!summary) {
    const needsMigration =
      /wallet tables are not installed|migrations 0013|schema is incomplete/i.test(error);
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-12">
        <h1 className="text-xl font-semibold text-ink-900">Wallet unavailable</h1>
        <p className="text-sm text-red-700">{error}</p>
        {needsMigration && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
            <p className="font-medium">Database setup required</p>
            <p className="mt-1">
              The production database does not have the seller wallet tables yet. An operator should run:
            </p>
            <pre className="mt-2 overflow-x-auto rounded bg-white/80 p-2 text-xs">
{`DATABASE_URL="your-production-url" npm run db:migrate`}
            </pre>
            <p className="mt-2 text-xs text-amber-800">
              This applies migrations 0013–0015 (seller_wallets, ledger, withdrawals, indexes). It does not move money.
            </p>
          </div>
        )}
        <a href="/dashboard" className="inline-block text-sm text-ink-600 underline">
          ← Back to overview
        </a>
      </div>
    );
  }

  const fmt = summary.formatted;
  const counts = summary.withdrawalCounts;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-900">Wallet</h1>
          <p className="mt-1 text-sm text-ink-500">Earnings from orders and withdrawals to your bank.</p>
          {summary.debtKobo > 0 && (
            <p className="mt-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Outstanding balance {fmt?.debt ?? formatNgn(summary.debtKobo)}. Withdrawals are unavailable
              until this amount is recovered from future earnings.
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/wallet/transactions" className="rounded border px-3 py-2 text-sm">
            All transactions
          </Link>
          <Link href="/dashboard/wallet/withdrawals" className="rounded border px-3 py-2 text-sm">
            Withdrawals
          </Link>
          <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setShowBank(true)}>
            {account ? "Change bank" : "Add bank"}
          </button>
          <button
            type="button"
            disabled={!summary.canWithdraw || busy}
            className="rounded bg-ink-900 px-3 py-2 text-sm text-white disabled:opacity-40"
            onClick={() => setShowWithdraw(true)}
          >
            Withdraw Money
          </button>
        </div>
      </div>

      {message && <p className="rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p>}
      {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Available", value: fmt?.available ?? formatNgn(summary.availableKobo), accent: true },
          { label: "Pending", value: fmt?.pending ?? formatNgn(summary.pendingKobo) },
          { label: "Total earned", value: fmt?.lifetimeEarned ?? formatNgn(summary.lifetimeEarnedKobo) },
          { label: "Total withdrawn", value: fmt?.lifetimeWithdrawn ?? formatNgn(summary.lifetimeWithdrawnKobo) },
        ].map((c) => (
          <div
            key={c.label}
            className={`rounded-xl border bg-white p-4 ${c.accent ? "border-ink-900/20 shadow-sm" : "border-ink-100"}`}
          >
            <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{c.label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-ink-900">{c.value}</p>
          </div>
        ))}
      </div>

      {counts && (counts.processing > 0 || counts.provider_unknown > 0 || counts.failed > 0) && (
        <div className="flex flex-wrap gap-2 text-sm">
          {counts.processing > 0 && (
            <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{counts.processing} processing</span>
          )}
          {counts.provider_unknown > 0 && (
            <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">
              {counts.provider_unknown} verifying with provider
            </span>
          )}
          {counts.failed > 0 && (
            <span className="rounded-full bg-red-50 px-3 py-1 text-red-800">{counts.failed} failed</span>
          )}
        </div>
      )}

      {account && (
        <p className="text-sm text-ink-600">
          Payout bank: <span className="font-medium">{account.bankName}</span> · ****{account.accountNumberLast4} ·{" "}
          {account.accountName}
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-ink-100 bg-white">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <h2 className="font-semibold">Recent transactions</h2>
            <Link href="/dashboard/wallet/transactions" className="text-sm text-ink-600 underline">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-ink-50">
            {txs.length === 0 && <li className="px-4 py-6 text-sm text-ink-500">No transactions yet.</li>}
            {txs.map((tx) => (
              <li key={tx.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-ink-900">
                    {tx.direction === "credit" ? "+" : "−"} {formatNgn(tx.amountKobo)}
                  </p>
                  <p className="text-ink-500">{tx.description || tx.entryType}</p>
                </div>
                <time className="shrink-0 text-xs text-ink-400">{new Date(tx.createdAt).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-ink-100 bg-white">
          <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
            <h2 className="font-semibold">Recent withdrawals</h2>
            <Link href="/dashboard/wallet/withdrawals" className="text-sm text-ink-600 underline">
              View all
            </Link>
          </div>
          <ul className="divide-y divide-ink-50">
            {withdrawals.length === 0 && <li className="px-4 py-6 text-sm text-ink-500">No withdrawals yet.</li>}
            {withdrawals.map((w) => (
              <li key={w.id} className="flex items-start justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <Link
                    href={`/dashboard/wallet/withdrawals/${w.id}`}
                    className="font-medium text-ink-900 underline-offset-2 hover:underline"
                  >
                    {formatNgn(w.amountKobo)}
                  </Link>
                  <p className="text-ink-500">{w.statusLabel || w.status}</p>
                </div>
                <time className="shrink-0 text-xs text-ink-400">{new Date(w.createdAt).toLocaleString()}</time>
              </li>
            ))}
          </ul>
        </section>
      </div>

      {showBank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-6">
            <h3 className="font-semibold">Bank account</h3>
            <select className="w-full rounded border px-3 py-2" value={bankCode} onChange={(e) => setBankCode(e.target.value)}>
              <option value="">Bank</option>
              {banks.map((b) => (
                <option key={b.code} value={b.code}>
                  {b.name}
                </option>
              ))}
            </select>
            <input
              className="w-full rounded border px-3 py-2"
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))}
              placeholder="10-digit account"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowBank(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded bg-ink-900 px-3 py-2 text-white"
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const bank = banks.find((x) => x.code === bankCode);
                    const res = await fetch("/api/wallet/bank/verify", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ bankCode, bankName: bank?.name || bankCode, accountNumber }),
                    });
                    const j = await res.json();
                    if (!res.ok) throw new Error(j.error);
                    setMessage("Bank account verified");
                    setShowBank(false);
                    await load();
                  } catch (e) {
                    setError(String((e as Error).message));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showWithdraw && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-white p-6">
            <h3 className="font-semibold">Withdraw</h3>
            <p className="text-sm text-ink-600">
              Available {fmt?.available ?? formatNgn(summary.availableKobo)} · Min{" "}
              {fmt?.minWithdrawal ?? formatNgn(summary.minWithdrawalKobo)}
            </p>
            <input
              className="w-full rounded border px-3 py-2"
              value={amountMajor}
              onChange={(e) => setAmountMajor(e.target.value)}
              placeholder="NGN amount"
            />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowWithdraw(false)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busy}
                className="rounded bg-ink-900 px-3 py-2 text-white"
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  try {
                    const amountKobo = Math.round(Number(amountMajor) * 100);
                    const res = await fetch("/api/wallet/withdraw", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ amountKobo, idempotencyKey: `ui_${Date.now().toString(36)}` }),
                    });
                    const j = await res.json();
                    if (!res.ok) throw new Error(j.error);
                    setMessage(
                      j.status === "provider_unknown"
                        ? "Withdrawal submitted — provider verification in progress. Your funds remain reserved."
                        : `Withdrawal ${j.status}`
                    );
                    setShowWithdraw(false);
                    await load();
                  } catch (e) {
                    setError(String((e as Error).message));
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
