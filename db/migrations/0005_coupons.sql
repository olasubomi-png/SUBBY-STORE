ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "discount_kobo" integer DEFAULT 0 NOT NULL;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "coupon_code" varchar(40);

CREATE TABLE IF NOT EXISTS "coupons" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "code" varchar(40) NOT NULL,
  "type" varchar(20) NOT NULL,
  "value" integer NOT NULL,
  "minimum_order_amount" integer DEFAULT 0 NOT NULL,
  "maximum_discount_amount" integer,
  "starts_at" timestamp with time zone,
  "expires_at" timestamp with time zone,
  "usage_limit" integer,
  "usage_count" integer DEFAULT 0 NOT NULL,
  "per_customer_limit" integer,
  "active" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "coupons_store_code_uidx" ON "coupons" ("store_id", "code");
CREATE INDEX IF NOT EXISTS "coupons_store_idx" ON "coupons" ("store_id");

CREATE TABLE IF NOT EXISTS "coupon_products" (
  "id" serial PRIMARY KEY NOT NULL,
  "coupon_id" integer NOT NULL REFERENCES "coupons"("id") ON DELETE CASCADE,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "coupon_products_uidx" ON "coupon_products" ("coupon_id", "product_id");
CREATE INDEX IF NOT EXISTS "coupon_products_coupon_idx" ON "coupon_products" ("coupon_id");
CREATE INDEX IF NOT EXISTS "coupon_products_product_idx" ON "coupon_products" ("product_id");
