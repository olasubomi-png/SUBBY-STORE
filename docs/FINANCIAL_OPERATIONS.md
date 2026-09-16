# SUBBY-STORE — Financial Operations Runbook

Phase 9.x seller wallet, Paystack Transfers, and reconciliation.

**Never** put secrets in this document. **Never** run production migrations from ad-hoc scripts without change control.

---

## 1. Architecture overview

```
Customer pays (Paystack charge)
  → order confirmed paid (idempotent)
  → ensureOrderEarningCredited (direct credit or pending_wallet_credits outbox)
  → seller_wallets.available_kobo ↑ + wallet_ledger order_earning (once per order)

Seller withdraws
  → ownership + debt + min amount checks
  → FOR UPDATE wallet row: available ↓ (withdrawal_hold ledger)
  → withdrawals row status=processing, unique reference
  → Paystack transfer with THAT reference only
  → success: lifetime_withdrawn ↑ (withdrawal_completed)
  → definitive fail: available ↑ (withdrawal_release)
  → ambiguous (timeout/5xx): status=provider_unknown, funds STAY reserved
  → webhook transfer.* or reconcileWithdrawal(reference) resolves state
```

All amounts are **integer kobo**. No floating-point money.

---

## 2. Ledger semantics

`wallet_ledger` is an **immutable** audit log. Live balances live on `seller_wallets` and are updated in the **same DB transaction** as the ledger row.

| entry_type | Effect |
|------------|--------|
| order_earning | available↑ (after debt), lifetime_earned↑ |
| refund_debit | available↓ or debt↑ |
| withdrawal_hold | available↓ (reserve) |
| withdrawal_completed | lifetime_withdrawn↑ (hold already applied) |
| withdrawal_release | available↑ (fail or reverse) |

Never edit historical ledger rows. Corrections = compensating entries.

---

## 3. Withdrawal state machine

Legal transitions:

- `pending` → `processing` | `cancelled`
- `processing` → `success` | `failed` | `provider_unknown`
- `provider_unknown` → `success` | `failed`
- `success` → `reversed`
- Same-state transitions are idempotent no-ops

**Illegal** (must not change balances):

- success → failed  
- failed → success  
- reversed → anything else  
- failed → reversed  

Enforced in code via `assertWithdrawalTransition` (`lib/server/wallet-state-machine.ts`).

---

## 4. Paystack transfer lifecycle

1. Create/verify transfer recipient (NUBAN) — store **recipient_code** + last-4 only.  
2. Reserve funds + insert withdrawal with **deterministic reference**.  
3. `POST /transfer` with that reference.  
4. **Never** call transfer again for the same withdrawal.  
5. Confirm via webhook `transfer.success|failed|reversed` or `GET /transfer/verify/:reference`.

### provider_unknown

Means: request may have been accepted; HTTP response was lost or ambiguous.

- Funds **remain reserved**  
- UI must **not** say “failed”  
- Resolve only with verify/webhook  

### CRITICAL

A network timeout after submit must **never** create a second transfer.

---

## 5. Webhooks

- Endpoint: `/api/paystack/webhook`  
- Signature: HMAC-SHA512 over **raw body**, timing-safe compare  
- Invalid signature → 401  
- Transfer events keyed by withdrawal **reference** + provider event id  
- Illegal state transitions → `ok: true, ignored_transition` (no balance change)  
- Subscription and transfer events share the same endpoint  

---

## 6. Reconciliation

### Automatic (cron)

`POST /api/cron/wallet-reconcile`  
Header: `Authorization: Bearer $CRON_SECRET` (min 16 chars)

Actions:

1. Process `pending_wallet_credits` (idempotent `order_earning:{orderId}`)  
2. Verify stuck `processing` / `provider_unknown` (age ≥ 30m) via existing reference  
3. Collect platform findings (missing/duplicate earnings, stuck rows)

Safe to run repeatedly. Does **not** auto-release ambiguous holds.

### Seller-scoped

`POST /api/wallet/reconcile` (authenticated seller, own store only):

- `{ "action": "run" }`  
- `{ "action": "verify_withdrawal", "reference": "..." }`  

### Findings requiring human review

- Duplicate `order_earning` for one order  
- Negative available/debt  
- Withdrawal missing `withdrawal_hold` ledger row  
- Paid order with no earning after outbox retries exhausted  

Do **not** blindly “fix” ambiguous amount mismatches.

---

## 7. Migration instructions

Apply in order on a maintenance window:

1. `0013_seller_wallet.sql` — wallets, ledger, banks, withdrawals  
2. `0014_wallet_hardening.sql` — pending credits, client idempotency, one active bank  
3. `0015_wallet_ops_indexes.sql` — status / ledger lookup indexes  

Recommended command (from the repo root, with your **production** `DATABASE_URL`):

```bash
DATABASE_URL="postgresql://..." npm run db:migrate
```

This records applied files in `schema_migrations` and is safe to re-run.  
If you see `relation "seller_wallets" does not exist` on `/dashboard/wallet`, these migrations have not been applied yet.

Verify with schema in `db/schema.ts`.

---

## 8. Production environment variables

Documented in `.env.example`. Required in production:

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Postgres |
| `SESSION_SECRET` | ≥32 chars |
| `PAYSTACK_SECRET_KEY` | `sk_…` server only |
| `APP_URL` | Public HTTPS origin |

Optional:

| Variable | Purpose |
|----------|---------|
| `PAYSTACK_PLAN_PRO` / `PAYSTACK_PLAN_BUSINESS` | Plan codes |
| `MIN_WITHDRAWAL_KOBO` | Default `100000` |
| `CRON_SECRET` | Cron auth |
| `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` | Client widgets only |

`PAYSTACK_MODE=mock` is **forbidden** when `NODE_ENV=production`.

---

## 9. Monitoring recommendations

Watch for:

- Rising `provider_unknown` count  
- `pending_wallet_credits` with high `attempts`  
- Cron `criticalFindings` > 0  
- Webhook 401 spikes (signature)  
- Withdrawal 429 rate limits  

Logs must never include secret keys, DB passwords, full account numbers, or PATs.

---

## 10. Incident response

### Stuck withdrawal (processing / provider_unknown)

1. Identify by `reference` (seller withdrawal detail or DB).  
2. Call Paystack verify **or** seller “Check provider status” / cron reconcile.  
3. On definitive success/fail, complete/fail once.  
4. **Do not** initiate a new transfer.  
5. **Do not** manually edit `available_kobo` without a compensating ledger entry.

### Missing earning after paid order

1. Confirm order `payment_status=paid`.  
2. Check ledger for `order_earning:{orderId}`.  
3. Check `pending_wallet_credits` for the order.  
4. Run cron or `processPendingWalletCredits`.  
5. If still missing, credit via `creditOrderEarning` only (idempotent).  

### Suspected double withdraw

1. Confirm unique `withdrawals.reference` and ledger `withdrawal_hold` once.  
2. Check Paystack for a single transfer with that reference.  
3. Do not reverse in Paystack without matching local `success` → `reversed` flow.

---

## 11. What MUST NOT be done manually

- Set wallet balances from the client or ad-hoc SQL without ledger rows  
- Re-run Paystack transfer with a new reference for the same withdrawal  
- Release `provider_unknown` funds without provider proof of failure  
- Disable webhook signature verification  
- Store full bank account numbers in logs  
- Apply migrations to production without backup and change control  
- Use `PAYSTACK_MODE=mock` in production  

---

## 12. Operator readiness (no platform admin role)

There is **no** platform-wide admin role. Operators should use:

- Protected cron endpoints with `CRON_SECRET`  
- Seller-owned reconcile for store-scoped issues  
- Read-only DB queries / findings from cron responses  
- Future admin UI should reuse `collectPlatformFindings` and never expose “set balance”
