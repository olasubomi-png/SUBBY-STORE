CREATE TABLE IF NOT EXISTS "store_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "product_id" integer REFERENCES "products"("id") ON DELETE SET NULL,
  "event_type" varchar(40) NOT NULL,
  "visitor_id" varchar(64),
  "metadata" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "store_events_store_idx" ON "store_events" ("store_id");
CREATE INDEX IF NOT EXISTS "store_events_type_idx" ON "store_events" ("event_type");
CREATE INDEX IF NOT EXISTS "store_events_created_idx" ON "store_events" ("created_at");
CREATE INDEX IF NOT EXISTS "store_events_product_idx" ON "store_events" ("product_id");
