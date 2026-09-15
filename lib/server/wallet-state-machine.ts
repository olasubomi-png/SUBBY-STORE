/**
 * Explicit withdrawal status transitions (Phase 9.5).
 * Illegal transitions throw; callers must treat as no-ops for webhooks.
 */

export type WithdrawalStatus =
  | "pending"
  | "processing"
  | "provider_unknown"
  | "success"
  | "failed"
  | "reversed"
  | "cancelled";

const ALLOWED: Record<string, ReadonlySet<string>> = {
  pending: new Set(["processing", "cancelled"]),
  processing: new Set(["success", "failed", "provider_unknown"]),
  provider_unknown: new Set(["success", "failed", "provider_unknown"]),
  success: new Set(["reversed", "success"]), // success→success = idempotent
  failed: new Set(["failed"]), // idempotent only
  reversed: new Set(["reversed"]),
  cancelled: new Set(["cancelled"]),
};

export function canTransitionWithdrawal(
  from: string,
  to: string
): boolean {
  const allowed = ALLOWED[from];
  if (!allowed) return false;
  return allowed.has(to);
}

export function assertWithdrawalTransition(from: string, to: string): void {
  if (from === to) return; // idempotent same-state
  if (!canTransitionWithdrawal(from, to)) {
    throw new Error(`illegal_withdrawal_transition:${from}->${to}`);
  }
}
