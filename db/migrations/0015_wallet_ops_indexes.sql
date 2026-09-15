-- Phase 9.5 — operational indexes for reconciliation / history (additive, safe)
CREATE INDEX IF NOT EXISTS "withdrawals_status_idx" ON "withdrawals" ("status");
CREATE INDEX IF NOT EXISTS "withdrawals_store_status_idx" ON "withdrawals" ("store_id", "status");
CREATE INDEX IF NOT EXISTS "wallet_ledger_order_idx" ON "wallet_ledger" ("order_id");
CREATE INDEX IF NOT EXISTS "wallet_ledger_withdrawal_idx" ON "wallet_ledger" ("withdrawal_id");
