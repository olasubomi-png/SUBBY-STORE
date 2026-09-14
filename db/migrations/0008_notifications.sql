CREATE TABLE IF NOT EXISTS "notifications" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "type" varchar(40) NOT NULL,
  "title" varchar(160) NOT NULL,
  "message" text NOT NULL,
  "related_order_id" integer,
  "related_product_id" integer,
  "related_coupon_id" integer,
  "href" varchar(255),
  "read" boolean DEFAULT false NOT NULL,
  "dedupe_key" varchar(160),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "notifications_store_idx" ON "notifications" ("store_id");
CREATE INDEX IF NOT EXISTS "notifications_store_unread_idx" ON "notifications" ("store_id", "read");
CREATE INDEX IF NOT EXISTS "notifications_created_idx" ON "notifications" ("created_at");
CREATE UNIQUE INDEX IF NOT EXISTS "notifications_dedupe_uidx" ON "notifications" ("store_id", "dedupe_key");
