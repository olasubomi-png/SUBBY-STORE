CREATE TABLE IF NOT EXISTS "campaigns" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "name" varchar(120) NOT NULL,
  "slug" varchar(100) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "campaign_type" varchar(40) NOT NULL,
  "status" varchar(20) DEFAULT 'draft' NOT NULL,
  "starts_at" timestamp with time zone,
  "ends_at" timestamp with time zone,
  "banner_url" text,
  "announcement_text" text,
  "coupon_id" integer REFERENCES "coupons"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "campaigns_store_slug_uidx" ON "campaigns" ("store_id", "slug");
CREATE INDEX IF NOT EXISTS "campaigns_store_idx" ON "campaigns" ("store_id");
CREATE INDEX IF NOT EXISTS "campaigns_store_status_idx" ON "campaigns" ("store_id", "status");
CREATE INDEX IF NOT EXISTS "campaigns_starts_idx" ON "campaigns" ("starts_at");
CREATE INDEX IF NOT EXISTS "campaigns_ends_idx" ON "campaigns" ("ends_at");
CREATE TABLE IF NOT EXISTS "campaign_products" (
  "id" serial PRIMARY KEY NOT NULL,
  "campaign_id" integer NOT NULL REFERENCES "campaigns"("id") ON DELETE CASCADE,
  "product_id" integer NOT NULL REFERENCES "products"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "campaign_products_uidx" ON "campaign_products" ("campaign_id", "product_id");
CREATE INDEX IF NOT EXISTS "campaign_products_campaign_idx" ON "campaign_products" ("campaign_id");
CREATE INDEX IF NOT EXISTS "campaign_products_product_idx" ON "campaign_products" ("product_id");
