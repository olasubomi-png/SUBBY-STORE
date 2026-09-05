/**
 * PostgreSQL integration tests for checkout reservations, payment confirmation,
 * and inventory concurrency.
 *
 * Opt-in only — does not run during normal `pnpm test` unless configured:
 *
 *   RUN_POSTGRES_TESTS=1
 *   USE_MEMORY_DB=0
 *   DATABASE_URL=postgresql://...   # disposable test DB / Neon branch
 *
 * Never point this at production data.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import postgres from "postgres";

const RUN =
  process.env.RUN_POSTGRES_TESTS === "1" &&
  Boolean(process.env.DATABASE_URL?.trim());

const describePg = RUN ? describe : describe.skip;

function uid() {
  return Math.random().toString(16).slice(2, 10);
}

async function applyMigrations(sql: ReturnType<typeof postgres>) {
  const dir = path.join(process.cwd(), "db/migrations");
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const body = fs.readFileSync(path.join(dir, file), "utf8");
    // drizzle dumps statements separated by --> statement-breakpoint
    const parts = body
      .split(/-->\s*statement-breakpoint/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const stmt of parts) {
      try {
        await sql.unsafe(stmt);
      } catch (e) {
        // IF NOT EXISTS migrations and re-runs are fine
        const msg = e instanceof Error ? e.message : String(e);
        if (!/already exists|duplicate/i.test(msg)) {
          throw e;
        }
      }
    }
  }
}

describePg("PostgreSQL payment & reservation concurrency", () => {
  // Force production repo path (not memory)
  beforeAll(async () => {
    process.env.USE_MEMORY_DB = "0";
    process.env.NODE_ENV = "test";
    process.env.VITEST = "true";
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL required for RUN_POSTGRES_TESTS=1");
    }

    const admin = postgres(process.env.DATABASE_URL, {
      max: 1,
      prepare: false,
    });
    try {
      // Disposable test DB only — isolate schema for this suite run
      await admin.unsafe("DROP SCHEMA IF EXISTS public CASCADE");
      await admin.unsafe("CREATE SCHEMA public");
      await admin.unsafe("GRANT ALL ON SCHEMA public TO public");
      await applyMigrations(admin);
    } finally {
      await admin.end({ timeout: 5 });
    }

    // Reset cached drizzle client so it picks up env
    const { closeDb } = await import("@/db/client");
    await closeDb();
  }, 60_000);

  afterAll(async () => {
    const { closeDb } = await import("@/db/client");
    await closeDb();
  });

  async function seedSellerProduct(stock: number) {
    const {
      signupUser,
      createStore,
      createProduct,
    } = await import("@/lib/server/repo");
    const tag = uid();
    const user = await signupUser({
      email: `pg-${tag}@test.local`,
      password: "password12",
      fullName: "PG Seller",
    });
    const store = await createStore({
      ownerId: user.id,
      name: `Shop ${tag}`,
      slug: `shop-${tag}`,
    });
    const product = await createProduct({
      ownerId: user.id,
      storeId: store.id,
      name: `Item ${tag}`,
      priceKobo: 10000,
      stock,
      category: "General",
    });
    return { user, store, product, tag };
  }

  async function readProductStock(productId: number) {
    const { getDb } = await import("@/db/client");
    const { products } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const db = getDb();
    const rows = await db
      .select()
      .from(products)
      .where(eq(products.id, productId))
      .limit(1);
    return rows[0]?.stock ?? null;
  }

  async function readOrder(reference: string) {
    const { getOrderByReference } = await import("@/lib/server/repo");
    return getOrderByReference(reference);
  }

  it("checkout reservation decrements available stock once", async () => {
    const { createPendingOrder } = await import("@/lib/server/repo");
    const { store, product } = await seedSellerProduct(5);
    const ref = `ref_res_${uid()}`;
    await createPendingOrder({
      storeId: store.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: `buyer-${uid()}@test.local`,
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 2 }],
      paymentReference: ref,
    });
    expect(await readProductStock(product.id)).toBe(3);
    const order = await readOrder(ref);
    expect(order?.paymentStatus).toBe("pending");
    expect(order?.stockReserved).toBe(true);
  });

  it("successful payment confirmation does not double-decrement stock", async () => {
    const {
      createPendingOrder,
      confirmPaidOrder,
    } = await import("@/lib/server/repo");
    const { store, product } = await seedSellerProduct(5);
    const ref = `ref_ok_${uid()}`;
    await createPendingOrder({
      storeId: store.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: `buyer-${uid()}@test.local`,
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: ref,
    });
    expect(await readProductStock(product.id)).toBe(4);
    const result = await confirmPaidOrder(ref, 10000);
    expect(result.alreadyPaid).toBe(false);
    expect(result.refundRequired).toBe(false);
    expect(result.order.paymentStatus).toBe("paid");
    expect(result.order.orderStatus).toBe("confirmed");
    expect(result.order.stockReserved).toBe(false);
    // reserved path: stock stays at 4 (not decremented again)
    expect(await readProductStock(product.id)).toBe(4);
  });

  it("duplicate confirmation is idempotent and stock changes once", async () => {
    const {
      createPendingOrder,
      confirmPaidOrder,
    } = await import("@/lib/server/repo");
    const { store, product } = await seedSellerProduct(3);
    const ref = `ref_dup_${uid()}`;
    await createPendingOrder({
      storeId: store.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: `buyer-${uid()}@test.local`,
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: ref,
    });
    const first = await confirmPaidOrder(ref, 10000);
    const second = await confirmPaidOrder(ref, 10000);
    expect(first.alreadyPaid).toBe(false);
    expect(second.alreadyPaid).toBe(true);
    expect(await readProductStock(product.id)).toBe(2);
    const order = await readOrder(ref);
    expect(order?.paymentStatus).toBe("paid");
  });

  it("duplicate rawEventId is idempotent", async () => {
    const {
      createPendingOrder,
      confirmPaidOrder,
    } = await import("@/lib/server/repo");
    const { store, product } = await seedSellerProduct(3);
    const ref = `ref_evt_${uid()}`;
    const eventId = `evt_${uid()}`;
    await createPendingOrder({
      storeId: store.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: `buyer-${uid()}@test.local`,
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: ref,
    });
    const first = await confirmPaidOrder(ref, 10000, eventId);
    const second = await confirmPaidOrder(ref, 10000, eventId);
    expect(first.alreadyPaid).toBe(false);
    expect(second.alreadyPaid).toBe(true);
    expect(await readProductStock(product.id)).toBe(2);
  });

  it("failed payment releases reservation stock once", async () => {
    const {
      createPendingOrder,
      markOrderPaymentFailed,
    } = await import("@/lib/server/repo");
    const { store, product } = await seedSellerProduct(5);
    const ref = `ref_fail_${uid()}`;
    await createPendingOrder({
      storeId: store.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: `buyer-${uid()}@test.local`,
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 2 }],
      paymentReference: ref,
    });
    expect(await readProductStock(product.id)).toBe(3);
    await markOrderPaymentFailed(ref);
    expect(await readProductStock(product.id)).toBe(5);
    await markOrderPaymentFailed(ref);
    expect(await readProductStock(product.id)).toBe(5);
    const order = await readOrder(ref);
    expect(order?.paymentStatus).toBe("failed");
    expect(order?.stockReserved).toBe(false);
  });

  it("expired reservation cleanup restores stock once", async () => {
    const {
      createPendingOrder,
      releaseExpiredOrderReservations,
    } = await import("@/lib/server/repo");
    const { getDb } = await import("@/db/client");
    const { orders } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { store, product } = await seedSellerProduct(5);
    const ref = `ref_exp_${uid()}`;
    const { order } = await createPendingOrder({
      storeId: store.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: `buyer-${uid()}@test.local`,
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 2 }],
      paymentReference: ref,
    });
    expect(await readProductStock(product.id)).toBe(3);

    const db = getDb();
    await db
      .update(orders)
      .set({ reservationExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(orders.id, order.id));

    const a = await releaseExpiredOrderReservations(20);
    expect(a.released).toBeGreaterThanOrEqual(1);
    expect(await readProductStock(product.id)).toBe(5);
    const b = await releaseExpiredOrderReservations(20);
    expect(await readProductStock(product.id)).toBe(5);
    const o = await readOrder(ref);
    expect(o?.stockReserved).toBe(false);
    expect(o?.paymentStatus).toBe("failed");
  });

  it("payment after reservation expiry yields refund_required", async () => {
    const {
      createPendingOrder,
      confirmPaidOrder,
    } = await import("@/lib/server/repo");
    const { getDb } = await import("@/db/client");
    const { orders } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const { store, product } = await seedSellerProduct(5);
    const ref = `ref_late_${uid()}`;
    const { order } = await createPendingOrder({
      storeId: store.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: `buyer-${uid()}@test.local`,
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: ref,
    });
    expect(await readProductStock(product.id)).toBe(4);

    const db = getDb();
    await db
      .update(orders)
      .set({ reservationExpiresAt: new Date(Date.now() - 60_000) })
      .where(eq(orders.id, order.id));

    const result = await confirmPaidOrder(ref, 10000);
    expect(result.refundRequired).toBe(true);
    expect(result.order.paymentStatus).toBe("paid");
    expect(result.order.orderStatus).toBe("refund_required");
    // expired path releases reserved unit back
    expect(await readProductStock(product.id)).toBe(5);
  });

  it("two concurrent checkouts for last unit: exactly one wins", async () => {
    const { createPendingOrder } = await import("@/lib/server/repo");
    const { store, product } = await seedSellerProduct(1);
    const refA = `ref_race_a_${uid()}`;
    const refB = `ref_race_b_${uid()}`;

    const results = await Promise.allSettled([
      createPendingOrder({
        storeId: store.id,
        customerName: "A",
        customerPhone: "08011111111",
        customerEmail: `a-${uid()}@test.local`,
        deliveryAddress: "Lagos",
        items: [{ productId: product.id, quantity: 1 }],
        paymentReference: refA,
      }),
      createPendingOrder({
        storeId: store.id,
        customerName: "B",
        customerPhone: "08022222222",
        customerEmail: `b-${uid()}@test.local`,
        deliveryAddress: "Abuja",
        items: [{ productId: product.id, quantity: 1 }],
        paymentReference: refB,
      }),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled");
    const fail = results.filter((r) => r.status === "rejected");
    expect(ok).toHaveLength(1);
    expect(fail).toHaveLength(1);
    expect(await readProductStock(product.id)).toBe(0);
  });

  it("inventory adjust races with checkout without negative stock", async () => {
    const {
      createPendingOrder,
      adjustProductStock,
    } = await import("@/lib/server/repo");
    const { store, product, user } = await seedSellerProduct(5);

    const results = await Promise.allSettled([
      createPendingOrder({
        storeId: store.id,
        customerName: "Buyer",
        customerPhone: "08011111111",
        customerEmail: `c-${uid()}@test.local`,
        deliveryAddress: "Lagos",
        items: [{ productId: product.id, quantity: 3 }],
        paymentReference: `ref_inv_${uid()}`,
      }),
      adjustProductStock(user.id, product.id, { mode: "set", value: 2 }),
    ]);

    // Both may succeed or one may fail depending on lock order; stock must be valid
    const stock = await readProductStock(product.id);
    expect(stock).not.toBeNull();
    expect(stock!).toBeGreaterThanOrEqual(0);
    // No crash / both settled
    expect(results).toHaveLength(2);
  });

  it("cannot confirm a failed payment", async () => {
    const {
      createPendingOrder,
      markOrderPaymentFailed,
      confirmPaidOrder,
    } = await import("@/lib/server/repo");
    const { store, product } = await seedSellerProduct(3);
    const ref = `ref_dead_${uid()}`;
    await createPendingOrder({
      storeId: store.id,
      customerName: "Buyer",
      customerPhone: "08011111111",
      customerEmail: `d-${uid()}@test.local`,
      deliveryAddress: "Lagos",
      items: [{ productId: product.id, quantity: 1 }],
      paymentReference: ref,
    });
    await markOrderPaymentFailed(ref);
    await expect(confirmPaidOrder(ref, 10000)).rejects.toThrow(/failed/i);
    expect(await readProductStock(product.id)).toBe(3);
  });
});
