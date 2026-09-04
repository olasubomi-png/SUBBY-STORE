ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "stock_reserved" boolean DEFAULT false NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "reservation_expires_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "orders_reservation_expiry_idx" ON "orders" ("reservation_expires_at");
