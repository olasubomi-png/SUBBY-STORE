CREATE TABLE IF NOT EXISTS "subscription_plans" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" varchar(80) NOT NULL,
  "slug" varchar(40) NOT NULL,
  "description" text DEFAULT '' NOT NULL,
  "price_kobo" integer NOT NULL,
  "billing_interval" varchar(20) DEFAULT 'monthly' NOT NULL,
  "product_limit" integer,
  "features_json" text DEFAULT '{}' NOT NULL,
  "active" boolean DEFAULT true NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_plans_slug_uidx" ON "subscription_plans" ("slug");
CREATE INDEX IF NOT EXISTS "subscription_plans_active_idx" ON "subscription_plans" ("active");

CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "plan_id" integer NOT NULL REFERENCES "subscription_plans"("id") ON DELETE RESTRICT,
  "status" varchar(20) DEFAULT 'active' NOT NULL,
  "provider" varchar(40) DEFAULT 'paystack' NOT NULL,
  "provider_subscription_code" varchar(120),
  "provider_customer_code" varchar(120),
  "current_period_start" timestamp with time zone,
  "current_period_end" timestamp with time zone,
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "canceled_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "subscriptions_store_idx" ON "subscriptions" ("store_id");
CREATE INDEX IF NOT EXISTS "subscriptions_status_idx" ON "subscriptions" ("status");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_store_uidx" ON "subscriptions" ("store_id");

CREATE TABLE IF NOT EXISTS "billing_transactions" (
  "id" serial PRIMARY KEY NOT NULL,
  "store_id" integer NOT NULL REFERENCES "stores"("id") ON DELETE CASCADE,
  "subscription_id" integer REFERENCES "subscriptions"("id") ON DELETE SET NULL,
  "provider" varchar(40) DEFAULT 'paystack' NOT NULL,
  "reference" varchar(120) NOT NULL,
  "amount_kobo" integer NOT NULL,
  "currency" varchar(3) DEFAULT 'NGN' NOT NULL,
  "status" varchar(20) DEFAULT 'pending' NOT NULL,
  "transaction_type" varchar(40) NOT NULL,
  "plan_id" integer REFERENCES "subscription_plans"("id") ON DELETE SET NULL,
  "raw_event_id" varchar(160),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "billing_transactions_reference_uidx" ON "billing_transactions" ("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "billing_transactions_raw_event_uidx" ON "billing_transactions" ("raw_event_id");
CREATE INDEX IF NOT EXISTS "billing_transactions_store_idx" ON "billing_transactions" ("store_id");
CREATE INDEX IF NOT EXISTS "billing_transactions_subscription_idx" ON "billing_transactions" ("subscription_id");

CREATE TABLE IF NOT EXISTS "subscription_events" (
  "id" serial PRIMARY KEY NOT NULL,
  "subscription_id" integer NOT NULL REFERENCES "subscriptions"("id") ON DELETE CASCADE,
  "event_type" varchar(60) NOT NULL,
  "provider_event_id" varchar(160),
  "metadata" text,
  "processed_at" timestamp with time zone DEFAULT now() NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "subscription_events_sub_idx" ON "subscription_events" ("subscription_id");
CREATE UNIQUE INDEX IF NOT EXISTS "subscription_events_provider_uidx" ON "subscription_events" ("provider_event_id");

INSERT INTO "subscription_plans" ("name", "slug", "description", "price_kobo", "billing_interval", "product_limit", "features_json", "active", "sort_order")
VALUES
  ('Free', 'free', 'Get started with a basic online store.', 0, 'monthly', 10,
   '{"campaigns":false,"coupons":false,"advancedAnalytics":false,"advancedCustomers":false,"advancedMarketing":false,"fullCustomization":true}',
   true, 0),
  ('Pro', 'pro', 'Grow with campaigns, coupons, and higher limits.', 500000, 'monthly', 100,
   '{"campaigns":true,"coupons":true,"advancedAnalytics":true,"advancedCustomers":true,"advancedMarketing":true,"fullCustomization":true}',
   true, 1),
  ('Business', 'business', 'Unlimited products and full marketing suite.', 1500000, 'monthly', NULL,
   '{"campaigns":true,"coupons":true,"advancedAnalytics":true,"advancedCustomers":true,"advancedMarketing":true,"fullCustomization":true}',
   true, 2)
ON CONFLICT (slug) DO NOTHING;
