-- Phase 9.1: Paystack recurring billing identifiers
ALTER TABLE "subscription_plans" ADD COLUMN IF NOT EXISTS "provider_plan_code" varchar(120);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "provider_authorization_code" varchar(120);
ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "provider_email_token" varchar(160);

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_provider_sub_uidx"
  ON "subscriptions" ("provider_subscription_code");
CREATE INDEX IF NOT EXISTS "subscriptions_provider_customer_idx"
  ON "subscriptions" ("provider_customer_code");
CREATE INDEX IF NOT EXISTS "subscription_plans_provider_plan_idx"
  ON "subscription_plans" ("provider_plan_code");
