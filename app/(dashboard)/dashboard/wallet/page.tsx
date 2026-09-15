"use client";
import { useCallback, useEffect, useState } from "react";
type Summary = { availableKobo: number; pendingKobo: number; lifetimeEarnedKobo: number; lifetimeWithdrawnKobo: number; debtKobo: number; minWithdrawalKobo: number; canWithdraw: boolean };
function formatNgn(kobo: number) { return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(kobo / 100); }
export default function WalletPage() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [txs, setTxs] = useState<Array<{ id: number; entryType: string; direction: string; amountKobo: number; orderId: number | null; createdAt: string }>>([]);
  const [banks, setBanks] = useState<Array<{ name: string; code: string }>>([]);
  const [account, setAccount] = useState<{ id: number; bankName: string; accountNumberLast4: string; accountName: string; bankCode: string } | null>(null);
  const [error, setError] = useState(""); const [message, setMessage] = useState(""); const [busy, setBusy] = useState(false);
  const [amountMajor, setAmountMajor] = useState(""); const [bankCode, setBankCode] = useState(""); const [accountNumber, setAccountNumber] = useState("");
  const [showWithdraw, setShowWithdraw] = useState(false); const [showBank, setShowBank] = useState(false);
  const load = useCallback(async () => {
    const [s, t, b] = await Promise.all([fetch("/api/wallet").then((r) => r.json()), fetch("/api/wallet/transactions").then((r) => r.json()), fetch("/api/wallet/banks").then((r) => r.json())]);
    if (s.error) throw new Error(s.error);
    setSummary(s); setTxs(t.transactions || []); setBanks(b.banks || []); setAccount(b.activeAccount || null);
  }, []);
  useEffect(() => { void load().catch((e) => setError(String(e.message || e))); }, [load]);
  if (!summary && !error) return <div className="p-8">Loading wallet…</div>;
  if (!summary) return <div className="p-8 text-red-600">{error}</div>;
  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex flex-wrap justify-between gap-2">
        <h1 className="text-2xl font-semibold">Wallet</h1>
        <div className="flex gap-2">
          <button type="button" className="rounded border px-3 py-2 text-sm" onClick={() => setShowBank(true)}>{account ? "Change bank" : "Add bank"}</button>
          <button type="button" disabled={!summary.canWithdraw || busy} className="rounded bg-ink-900 px-3 py-2 text-sm text-white disabled:opacity-40" onClick={() => setShowWithdraw(true)}>Withdraw</button>
        </div>
      </div>
      {message && <p className="text-sm text-emerald-700">{message}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[["Available", summary.availableKobo], ["Pending", summary.pendingKobo], ["Earned", summary.lifetimeEarnedKobo], ["Withdrawn", summary.lifetimeWithdrawnKobo]].map(([l, v]) => (
          <div key={String(l)} className="rounded-xl border p-4"><p className="text-xs uppercase text-ink-500">{l}</p><p className="text-xl font-semibold">{formatNgn(Number(v))}</p></div>
        ))}
      </div>
      {account && <p className="text-sm">{account.bankName} ****{account.accountNumberLast4} · {account.accountName}</p>}
      <ul className="divide-y rounded-xl border bg-white">{txs.map((tx) => (
        <li key={tx.id} className="flex justify-between px-4 py-3 text-sm"><span className="capitalize">{tx.entryType.replace(/_/g, " ")}</span><span>{tx.direction === "credit" ? "+" : "−"}{formatNgn(tx.amountKobo)}</span></li>
      ))}</ul>
      {showBank && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md space-y-3 rounded-xl bg-white p-6">
        <h3 className="font-semibold">Verify bank</h3>
        <select className="w-full rounded border px-3 py-2" value={bankCode} onChange={(e) => setBankCode(e.target.value)}><option value="">Bank</option>{banks.map((b) => <option key={b.code} value={b.code}>{b.name}</option>)}</select>
        <input className="w-full rounded border px-3 py-2" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="10-digit account" />
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowBank(false)}>Cancel</button>
          <button type="button" disabled={busy} className="rounded bg-ink-900 px-3 py-2 text-white" onClick={async () => { setBusy(true); try { const bank = banks.find((x) => x.code === bankCode); const res = await fetch("/api/wallet/bank/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bankCode, bankName: bank?.name || bankCode, accountNumber }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error); setMessage("Verified"); setShowBank(false); await load(); } catch (e) { setError(String((e as Error).message)); } finally { setBusy(false); } }}>Save</button></div>
      </div></div>}
      {showWithdraw && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"><div className="w-full max-w-md space-y-3 rounded-xl bg-white p-6">
        <h3 className="font-semibold">Withdraw</h3>
        <p className="text-sm">Available {formatNgn(summary.availableKobo)}</p>
        <input className="w-full rounded border px-3 py-2" value={amountMajor} onChange={(e) => setAmountMajor(e.target.value)} placeholder="NGN amount" />
        <div className="flex justify-end gap-2"><button type="button" onClick={() => setShowWithdraw(false)}>Cancel</button>
          <button type="button" disabled={busy} className="rounded bg-ink-900 px-3 py-2 text-white" onClick={async () => { setBusy(true); try { const amountKobo = Math.round(Number(amountMajor) * 100); const res = await fetch("/api/wallet/withdraw", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amountKobo, idempotencyKey: `ui_${Date.now().toString(36)}` }) }); const j = await res.json(); if (!res.ok) throw new Error(j.error); setMessage(`Status: ${j.status}`); setShowWithdraw(false); await load(); } catch (e) { setError(String((e as Error).message)); } finally { setBusy(false); } }}>Confirm</button></div>
      </div></div>}
    </div>
  );
}
