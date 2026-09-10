-- Multiple product images gallery
CREATE TABLE IF NOT EXISTS "product_images" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"image_url" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk"
    FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_images_product_idx" ON "product_images" ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "product_images_product_sort_idx" ON "product_images" ("product_id", "sort_order");
--> statement-breakpoint
-- Backfill gallery from legacy products.image_url (preserve Blob URLs)
INSERT INTO "product_images" ("product_id", "image_url", "sort_order")
SELECT p."id", p."image_url", 0
FROM "products" p
WHERE p."image_url" IS NOT NULL
  AND p."image_url" <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "product_images" pi
    WHERE pi."product_id" = p."id" AND pi."image_url" = p."image_url"
  );
