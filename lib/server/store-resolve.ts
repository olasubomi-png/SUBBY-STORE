/**
 * Shared seller-store resolution for dashboard APIs.
 * Never trust client storeId without ownership checks.
 */
import { getSession, type SessionPayload } from "@/lib/server/auth";
import { listStoresForOwner } from "@/lib/server/repo";

export type OwnedStoreSummary = {
  id: number;
  name: string;
  slug: string;
};

export type ResolveStoresResult =
  | { ok: true; session: SessionPayload; stores: OwnedStoreSummary[]; primary: OwnedStoreSummary }
  | { ok: false; status: 401 | 404; error: string };

/**
 * Authenticate and resolve the seller's owned stores.
 * Optional preferredStoreId must belong to the seller when provided.
 */
export async function resolveSellerStores(
  preferredStoreId?: number | null
): Promise<ResolveStoresResult> {
  const session = await getSession();
  if (!session) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const storesRaw = await listStoresForOwner(session.userId);
  const stores: OwnedStoreSummary[] = storesRaw.map((s) => ({
    id: s.id,
    name: s.name,
    slug: s.slug,
  }));

  if (stores.length === 0) {
    return { ok: false, status: 404, error: "No store found for this account" };
  }

  if (
    preferredStoreId != null &&
    Number.isSafeInteger(preferredStoreId) &&
    preferredStoreId > 0
  ) {
    const match = stores.find((s) => s.id === preferredStoreId);
    if (!match) {
      return { ok: false, status: 404, error: "Store not found" };
    }
    // Ownership already enforced via listStoresForOwner filter
    return { ok: true, session, stores, primary: match };
  }

  return { ok: true, session, stores, primary: stores[0]! };
}

export function parseOptionalStoreId(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}
