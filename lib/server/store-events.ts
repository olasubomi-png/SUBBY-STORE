import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { storeEvents } from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";

export async function recordStoreEvent(input: {
  storeId: number;
  productId?: number;
  eventType: string;
  visitorId?: string;
  metadata?: string | null;
}) {
  if (useMemory()) {
    mem.memRecordStoreEvent(input);
    return;
  }
  const db = getDb();
  await db.insert(storeEvents).values({
    storeId: input.storeId,
    productId: input.productId ?? null,
    eventType: input.eventType,
    visitorId: input.visitorId || null,
    metadata: input.metadata ?? null,
  });
}

export async function countStoreEvents(
  storeIds: number[],
  eventType: string,
  since: Date
): Promise<number> {
  if (storeIds.length === 0) return 0;
  if (useMemory()) {
    return mem.memCountStoreEvents(storeIds, eventType, since);
  }
  const db = getDb();
  const rows = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(storeEvents)
    .where(
      and(
        sql`${storeEvents.storeId} IN (${sql.join(
          storeIds.map((id) => sql`${id}`),
          sql`, `
        )})`,
        eq(storeEvents.eventType, eventType),
        gte(storeEvents.createdAt, since)
      )
    );
  return Number(rows[0]?.c || 0);
}
