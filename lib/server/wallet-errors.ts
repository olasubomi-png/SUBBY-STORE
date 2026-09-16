/** Map low-level DB errors to safe, actionable API messages. */
export function mapWalletError(err: unknown): { message: string; status: number } {
  const raw = err instanceof Error ? err.message : String(err);
  const lower = raw.toLowerCase();

  if (
    lower.includes("seller_wallets") &&
    (lower.includes("does not exist") || lower.includes("undefined_table"))
  ) {
    return {
      message:
        "Wallet tables are not installed on this database yet. An operator must run migrations 0013–0015 (npm run db:migrate with DATABASE_URL).",
      status: 503,
    };
  }
  if (
    (lower.includes("wallet_ledger") ||
      lower.includes("withdrawals") ||
      lower.includes("seller_bank_accounts") ||
      lower.includes("pending_wallet_credits")) &&
    (lower.includes("does not exist") || lower.includes("undefined_table"))
  ) {
    return {
      message:
        "Wallet schema is incomplete. Run database migrations 0013–0015 before using the wallet.",
      status: 503,
    };
  }

  // Never leak connection strings / internal details to clients
  if (lower.includes("password") || lower.includes("connection") || lower.includes("econnrefused")) {
    return { message: "Wallet service temporarily unavailable.", status: 503 };
  }

  return { message: raw.slice(0, 200) || "Wallet request failed", status: 400 };
}
