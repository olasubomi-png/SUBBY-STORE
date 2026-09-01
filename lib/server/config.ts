/**
 * Production configuration guards.
 * Call assertProductionConfig() early on critical paths.
 */

export function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Memory DB is only for explicit tests / local demo.
 * Production must never fall back to memory.
 */
export function allowMemoryDb(): boolean {
  if (isProduction()) return false;
  return (
    process.env.USE_MEMORY_DB === "1" ||
    process.env.NODE_ENV === "test" ||
    process.env.VITEST === "true"
  );
}

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    throw new Error(
      "DATABASE_URL is required. In-memory database is not allowed in this environment."
    );
  }
  return url;
}

export function requireSessionSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim();
  if (!secret || secret.length < 32) {
    throw new Error(
      "SESSION_SECRET must be set to a random string of at least 32 characters"
    );
  }
  if (
    isProduction() &&
    (secret.includes("REPLACE") || secret === "dev_session_secret_at_least_32_chars_long")
  ) {
    throw new Error(
      "SESSION_SECRET must not use a placeholder value in production"
    );
  }
  return secret;
}

/**
 * Mock Paystack is never allowed in production.
 * Placeholder keys containing REPLACE only enable mock outside production.
 */
export function isPaystackMockMode(): boolean {
  if (isProduction()) {
    if (process.env.PAYSTACK_MODE === "mock") {
      throw new Error(
        "PAYSTACK_MODE=mock is not allowed when NODE_ENV=production"
      );
    }
    return false;
  }
  if (process.env.PAYSTACK_MODE === "mock") return true;
  const key = process.env.PAYSTACK_SECRET_KEY || "";
  return (
    key.includes("REPLACE") ||
    key === "sk_test_mock" ||
    key === ""
  );
}

export function requirePaystackSecret(): string {
  if (isProduction() && process.env.PAYSTACK_MODE === "mock") {
    throw new Error(
      "PAYSTACK_MODE=mock is not allowed when NODE_ENV=production"
    );
  }
  const key = process.env.PAYSTACK_SECRET_KEY?.trim();
  if (!key) {
    throw new Error("PAYSTACK_SECRET_KEY is required");
  }
  if (isProduction()) {
    if (key.includes("REPLACE") || key === "sk_test_mock") {
      throw new Error(
        "PAYSTACK_SECRET_KEY must be a real Paystack secret in production (not a placeholder)"
      );
    }
    if (!key.startsWith("sk_")) {
      throw new Error("PAYSTACK_SECRET_KEY appears invalid");
    }
  }
  return key;
}

/** Fail-fast production bootstrap checks. */
export function assertProductionConfig(): void {
  if (!isProduction()) return;
  requireDatabaseUrl();
  requireSessionSecret();
  requirePaystackSecret();
  if (!process.env.APP_URL?.trim()) {
    throw new Error("APP_URL is required in production");
  }
}
