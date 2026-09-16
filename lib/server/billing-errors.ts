/** Map low-level DB errors for billing/subscription APIs. */
export function mapBillingError(err: unknown): { message: string; status: number } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    (lower.includes("subscriptions") ||
      lower.includes("subscription_plans") ||
      lower.includes("billing_transactions") ||
      lower.includes("subscription_events")) &&
    (lower.includes("does not exist") || lower.includes("undefined_table"))
  ) {
    return {
      message:
        "Subscription tables are not installed. An operator must run: MIGRATE_REPAIR=subscriptions DATABASE_URL=... npm run db:migrate",
      status: 503,
    };
  }
  if (lower.includes("password") || lower.includes("econnrefused")) {
    return { message: "Billing service temporarily unavailable.", status: 503 };
  }
  return { message: raw.slice(0, 200) || "Billing request failed", status: 400 };
}
