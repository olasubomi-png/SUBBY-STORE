-- Phase 8: seller-controlled SEO & social preview fields
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "seo_title" varchar(70);
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "seo_description" varchar(160);
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "seo_keywords" varchar(255);
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "og_title" varchar(70);
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "og_description" varchar(160);
ALTER TABLE "stores" ADD COLUMN IF NOT EXISTS "og_image_url" text;
