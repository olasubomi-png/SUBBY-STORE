-- Phase 9.3.1 — wallet / withdrawal financial hardening
CREATE TABLE IF NOT EXISTS "pending_wallet_credits" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "order_id" integer NOT NULL REFERENCES "orders"("id") ON DELETE CASCADE,
  "amount_kobo" integer NOT NULL,
  "payment_reference" varchar(160),
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "last_error" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "processed_at" timestamp with time zone,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "pending_wallet_credits_order_uidx" ON "pending_wallet_credits" ("order_id");
CREATE INDEX IF NOT EXISTS "pending_wallet_credits_status_idx" ON "pending_wallet_credits" ("status");
ALTER TABLE "withdrawals" ADD COLUMN IF NOT EXISTS "client_idempotency_key" varchar(80);
CREATE UNIQUE INDEX IF NOT EXISTS "withdrawals_client_idempotency_uidx"
  ON "withdrawals" ("store_id", "client_idempotency_key")
  WHERE "client_idempotency_key" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "seller_bank_accounts_one_active_uidx"
  ON "seller_bank_accounts" ("store_id")
  WHERE "active" = true;
