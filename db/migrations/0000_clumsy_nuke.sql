CREATE TABLE "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"product_id" integer,
	"product_name_snapshot" varchar(160) NOT NULL,
	"unit_price_kobo_snapshot" integer NOT NULL,
	"quantity" integer NOT NULL,
	"line_total_kobo" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"customer_name" varchar(120) NOT NULL,
	"customer_phone" varchar(32) NOT NULL,
	"customer_email" varchar(255) NOT NULL,
	"delivery_address" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"subtotal_kobo" integer NOT NULL,
	"total_kobo" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"payment_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"order_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"payment_reference" varchar(120),
	"paystack_access_code" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"reference" varchar(120) NOT NULL,
	"amount_kobo" integer NOT NULL,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"provider" varchar(32) DEFAULT 'paystack' NOT NULL,
	"raw_event_id" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"store_id" integer NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_kobo" integer NOT NULL,
	"image_url" text,
	"stock" integer DEFAULT 0 NOT NULL,
	"category" varchar(80) DEFAULT 'General' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" serial PRIMARY KEY NOT NULL,
	"owner_id" integer NOT NULL,
	"name" varchar(120) NOT NULL,
	"slug" varchar(80) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"logo_url" text,
	"phone" varchar(32),
	"whatsapp" varchar(32),
	"email" varchar(255),
	"address" text,
	"currency" varchar(3) DEFAULT 'NGN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "orders_store_idx" ON "orders" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_payment_ref_uidx" ON "orders" USING btree ("payment_reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_reference_uidx" ON "payments" USING btree ("reference");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_raw_event_id_uidx" ON "payments" USING btree ("raw_event_id");--> statement-breakpoint
CREATE INDEX "payments_order_idx" ON "payments" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "products_store_idx" ON "products" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "products_store_slug_uidx" ON "products" USING btree ("store_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_slug_uidx" ON "stores" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "stores_owner_idx" ON "stores" USING btree ("owner_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uidx" ON "users" USING btree ("email");