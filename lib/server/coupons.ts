/**
 * Coupon CRUD + validation (Postgres + memory).
 */
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { coupons, couponProducts, orders, products } from "@/db/schema";
import * as mem from "@/lib/server/memory-repo";
import { allowMemoryDb, isProduction, requireDatabaseUrl } from "@/lib/server/config";
import {
  computeDiscount,
  normalizeCouponCode,
  type CouponType,
} from "@/lib/coupons/math";
import {
  assertCouponValue,
  assertCouponDates,
  assertOptionalPositiveInt,
} from "@/lib/coupons/validate";
import { ngnMajorToKobo, koboToNgnMajor } from "@/lib/money";
import { stores } from "@/db/schema";

function useMemory(): boolean {
  if (isProduction()) {
    requireDatabaseUrl();
    return false;
  }
  if (allowMemoryDb()) return true;
  return !process.env.DATABASE_URL;
}

async function assertStoreOwned(storeId: number, ownerId: number) {
  if (useMemory()) {
    mem.memGetStoreForOwner(storeId, ownerId);
    return;
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(stores)
    .where(and(eq(stores.id, storeId), eq(stores.ownerId, ownerId)))
    .limit(1);
  if (!rows[0]) throw new Error("Store not found");
}

export type CouponRow = {
  id: number;
  storeId: number;
  code: string;
  type: string;
  value: number;
  minimumOrderAmount: number;
  maximumDiscountAmount: number | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  usageCount: number;
  perCustomerLimit: number | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
  productIds?: number[];
};

export async function listCouponsForOwner(ownerId: number, storeId: number) {
  await assertStoreOwned(storeId, ownerId);
  if (useMemory()) {
    return mem.memListCoupons(storeId);
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(coupons)
    .where(eq(coupons.storeId, storeId));
  const ids = rows.map((r) => r.id);
  const links =
    ids.length === 0
      ? []
      : await db
          .select()
          .from(couponProducts)
          .where(inArray(couponProducts.couponId, ids));
  const byCoupon = new Map<number, number[]>();
  for (const l of links) {
    const list = byCoupon.get(l.couponId) || [];
    list.push(l.productId);
    byCoupon.set(l.couponId, list);
  }
  return rows.map((r) => ({
    ...r,
    productIds: byCoupon.get(r.id) || [],
  }));
}

export async function createCoupon(
  ownerId: number,
  input: {
    storeId: number;
    code: string;
    type: CouponType;
    value: number;
    minimumOrderAmountNgn?: number;
    maximumDiscountAmountNgn?: number | null;
    startsAt?: Date | null;
    expiresAt?: Date | null;
    usageLimit?: number | null;
    perCustomerLimit?: number | null;
    active?: boolean;
    productIds?: number[];
  }
) {
  await assertStoreOwned(input.storeId, ownerId);
  const code = normalizeCouponCode(input.code);
  if (code.length < 2) throw new Error("Invalid coupon code");
  assertCouponValue(
    input.type,
    input.type === "fixed" ? ngnMajorToKobo(input.value) : input.value
  );
  assertCouponDates(input.startsAt ?? null, input.expiresAt ?? null);
  assertOptionalPositiveInt("usage limit", input.usageLimit ?? null);
  assertOptionalPositiveInt("per-customer limit", input.perCustomerLimit ?? null);
  // Fixed coupons: API value is NGN major units → store as kobo
  const storedValue =
    input.type === "fixed" ? ngnMajorToKobo(input.value) : input.value;
  const minKobo = ngnMajorToKobo(input.minimumOrderAmountNgn ?? 0);
  if (minKobo < 0) throw new Error("Invalid minimum order amount");
  const maxKobo =
    input.maximumDiscountAmountNgn == null
      ? null
      : ngnMajorToKobo(input.maximumDiscountAmountNgn);
  if (maxKobo != null && maxKobo < 0) {
    throw new Error("Invalid maximum discount amount");
  }

  if (useMemory()) {
    return mem.memCreateCoupon(ownerId, {
      storeId: input.storeId,
      code,
      type: input.type,
      value: storedValue,
      minimumOrderAmount: minKobo,
      maximumDiscountAmount: maxKobo,
      startsAt: input.startsAt ?? null,
      expiresAt: input.expiresAt ?? null,
      usageLimit: input.usageLimit ?? null,
      perCustomerLimit: input.perCustomerLimit ?? null,
      active: input.active ?? true,
      productIds: input.productIds || [],
    });
  }

  const db = getDb();
  return db.transaction(async (tx) => {
    const inserted = await tx
      .insert(coupons)
      .values({
        storeId: input.storeId,
        code,
        type: input.type,
        value: storedValue,
        minimumOrderAmount: minKobo,
        maximumDiscountAmount: maxKobo,
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
        usageLimit: input.usageLimit ?? null,
        usageCount: 0,
        perCustomerLimit: input.perCustomerLimit ?? null,
        active: input.active ?? true,
      })
      .returning();
    const row = inserted[0]!;
    const pids = [...new Set(input.productIds || [])];
    if (pids.length > 0) {
      // verify products belong to store
      const owned = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(eq(products.storeId, input.storeId), inArray(products.id, pids))
        );
      if (owned.length !== pids.length) {
        throw new Error("One or more products are invalid for this store");
      }
      await tx.insert(couponProducts).values(
        pids.map((productId) => ({ couponId: row.id, productId }))
      );
    }
    return { ...row, productIds: pids };
  });
}

export async function updateCoupon(
  ownerId: number,
  couponId: number,
  patch: Partial<{
    code: string;
    type: CouponType;
    value: number;
    minimumOrderAmountNgn: number;
    maximumDiscountAmountNgn: number | null;
    startsAt: Date | null;
    expiresAt: Date | null;
    usageLimit: number | null;
    perCustomerLimit: number | null;
    active: boolean;
    productIds: number[];
  }>
) {
  if (useMemory()) {
    return mem.memUpdateCoupon(ownerId, couponId, patch);
  }
  const db = getDb();
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(coupons)
      .where(eq(coupons.id, couponId))
      .limit(1)
      .for("update");
    const row = rows[0];
    if (!row) throw new Error("Coupon not found");
    await assertStoreOwned(row.storeId, ownerId);

    // Final resulting state (authoritative validation)
    const finalType = (patch.type ?? row.type) as CouponType;
    let finalValue = row.value;
    if (patch.value !== undefined) {
      finalValue =
        finalType === "fixed" ? ngnMajorToKobo(patch.value) : patch.value;
    } else if (patch.type !== undefined && patch.type !== row.type) {
      // Type changed without new value — validate existing stored value as new type
      finalValue = row.value;
    }
    assertCouponValue(finalType, finalValue);

    const finalStarts =
      patch.startsAt !== undefined ? patch.startsAt : row.startsAt;
    const finalExpires =
      patch.expiresAt !== undefined ? patch.expiresAt : row.expiresAt;
    assertCouponDates(finalStarts, finalExpires);

    const finalUsage =
      patch.usageLimit !== undefined ? patch.usageLimit : row.usageLimit;
    const finalPerCustomer =
      patch.perCustomerLimit !== undefined
        ? patch.perCustomerLimit
        : row.perCustomerLimit;
    assertOptionalPositiveInt("usage limit", finalUsage);
    assertOptionalPositiveInt("per-customer limit", finalPerCustomer);

    if (patch.minimumOrderAmountNgn !== undefined) {
      const minK = ngnMajorToKobo(patch.minimumOrderAmountNgn);
      if (minK < 0) throw new Error("Invalid minimum order amount");
    }
    if (
      patch.maximumDiscountAmountNgn !== undefined &&
      patch.maximumDiscountAmountNgn != null
    ) {
      const maxK = ngnMajorToKobo(patch.maximumDiscountAmountNgn);
      if (maxK < 0) throw new Error("Invalid maximum discount amount");
    }

    const values: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.code !== undefined) {
      const code = normalizeCouponCode(patch.code);
      if (code.length < 2) throw new Error("Invalid coupon code");
      values.code = code;
    }
    if (patch.type !== undefined) values.type = finalType;
    if (patch.value !== undefined || patch.type !== undefined) {
      values.value = finalValue;
    }
    if (patch.minimumOrderAmountNgn !== undefined) {
      values.minimumOrderAmount = ngnMajorToKobo(patch.minimumOrderAmountNgn);
    }
    if (patch.maximumDiscountAmountNgn !== undefined) {
      values.maximumDiscountAmount =
        patch.maximumDiscountAmountNgn == null
          ? null
          : ngnMajorToKobo(patch.maximumDiscountAmountNgn);
    }
    if (patch.startsAt !== undefined) values.startsAt = patch.startsAt;
    if (patch.expiresAt !== undefined) values.expiresAt = patch.expiresAt;
    if (patch.usageLimit !== undefined) values.usageLimit = patch.usageLimit;
    if (patch.perCustomerLimit !== undefined) {
      values.perCustomerLimit = patch.perCustomerLimit;
    }
    if (patch.active !== undefined) values.active = patch.active;

    const updated = await tx
      .update(coupons)
      .set(values)
      .where(eq(coupons.id, couponId))
      .returning();
    const next = updated[0]!;

    if (patch.productIds !== undefined) {
      const pids = [...new Set(patch.productIds)];
      if (pids.length > 0) {
        const owned = await tx
          .select({ id: products.id })
          .from(products)
          .where(
            and(eq(products.storeId, row.storeId), inArray(products.id, pids))
          );
        if (owned.length !== pids.length) {
          throw new Error("One or more products are invalid for this store");
        }
      }
      await tx
        .delete(couponProducts)
        .where(eq(couponProducts.couponId, couponId));
      if (pids.length > 0) {
        await tx.insert(couponProducts).values(
          pids.map((productId) => ({ couponId, productId }))
        );
      }
      return { ...next, productIds: pids };
    }

    const links = await tx
      .select()
      .from(couponProducts)
      .where(eq(couponProducts.couponId, couponId));
    return { ...next, productIds: links.map((l) => l.productId) };
  });
}

export async function deleteCoupon(ownerId: number, couponId: number) {
  if (useMemory()) {
    return mem.memDeleteCoupon(ownerId, couponId);
  }
  const db = getDb();
  const rows = await db
    .select()
    .from(coupons)
    .where(eq(coupons.id, couponId))
    .limit(1);
  if (!rows[0]) throw new Error("Coupon not found");
  await assertStoreOwned(rows[0].storeId, ownerId);
  await db.delete(coupons).where(eq(coupons.id, couponId));
  return { deleted: true };
}

export type ValidateCouponResult = {
  ok: true;
  code: string;
  type: string;
  discountKobo: number;
  subtotalKobo: number;
  totalKobo: number;
  message: string;
};

export type ValidateCouponError = {
  ok: false;
  error: string;
};

/**
 * Validate a coupon against priced cart lines (server-side prices only).
 */
export async function validateCouponForCart(input: {
  storeId: number;
  code: string;
  /** Already server-priced lines */
  lines: Array<{ productId: number; lineTotalKobo: number }>;
  customerEmail?: string;
  /** When true, lock coupon and reserve one use (checkout). */
  reserveUsage?: boolean;
}): Promise<ValidateCouponResult | ValidateCouponError> {
  const code = normalizeCouponCode(input.code);
  const subtotalKobo = input.lines.reduce((s, l) => s + l.lineTotalKobo, 0);

  if (useMemory()) {
    return mem.memValidateCouponForCart({
      storeId: input.storeId,
      code,
      lines: input.lines,
      customerEmail: input.customerEmail,
      reserveUsage: input.reserveUsage,
    });
  }

  const db = getDb();
  const run = async (tx: typeof db) => {
    const q = tx
      .select()
      .from(coupons)
      .where(and(eq(coupons.storeId, input.storeId), eq(coupons.code, code)))
      .limit(1);
    const rows = input.reserveUsage
      ? await q.for("update")
      : await q;
    const coupon = rows[0];
    if (!coupon) return { ok: false as const, error: "Invalid coupon code" };
    if (!coupon.active) return { ok: false as const, error: "Coupon is inactive" };

    const now = new Date();
    if (coupon.startsAt && now < coupon.startsAt) {
      return { ok: false as const, error: "Coupon is not active yet" };
    }
    if (coupon.expiresAt && now > coupon.expiresAt) {
      return { ok: false as const, error: "Coupon has expired" };
    }
    if (
      coupon.usageLimit != null &&
      coupon.usageCount >= coupon.usageLimit
    ) {
      return { ok: false as const, error: "Coupon usage limit reached" };
    }

    if (coupon.perCustomerLimit != null && input.customerEmail) {
      const email = input.customerEmail.toLowerCase().trim();
      const used = await tx
        .select({ id: orders.id })
        .from(orders)
        .where(
          and(
            eq(orders.storeId, input.storeId),
            eq(orders.couponCode, code),
            eq(orders.customerEmail, email),
            sql`${orders.paymentStatus} != 'failed'`
          )
        );
      if (used.length >= coupon.perCustomerLimit) {
        return {
          ok: false as const,
          error: "Coupon per-customer limit reached",
        };
      }
    }

    const links = await tx
      .select()
      .from(couponProducts)
      .where(eq(couponProducts.couponId, coupon.id));
    const restricted = links.map((l) => l.productId);
    const eligibleLines =
      restricted.length === 0
        ? input.lines
        : input.lines.filter((l) => restricted.includes(l.productId));
    const eligibleSubtotal = eligibleLines.reduce(
      (s, l) => s + l.lineTotalKobo,
      0
    );

    if (restricted.length > 0 && eligibleSubtotal <= 0) {
      return {
        ok: false as const,
        error: "Coupon does not apply to items in your cart",
      };
    }

    if (
      coupon.minimumOrderAmount > 0 &&
      subtotalKobo < coupon.minimumOrderAmount
    ) {
      return {
        ok: false as const,
        error: "Order does not meet the minimum amount for this coupon",
      };
    }

    const { discountKobo, totalKobo } = computeDiscount({
      type: coupon.type as CouponType,
      value: coupon.value,
      eligibleSubtotalKobo: eligibleSubtotal,
      cartSubtotalKobo: subtotalKobo,
      minimumOrderAmountKobo: coupon.minimumOrderAmount,
      maximumDiscountAmountKobo: coupon.maximumDiscountAmount,
    });

    if (discountKobo <= 0) {
      return { ok: false as const, error: "Coupon does not reduce this order" };
    }

    if (input.reserveUsage) {
      const updated = await tx
        .update(coupons)
        .set({
          usageCount: sql`${coupons.usageCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(coupons.id, coupon.id),
            sql`(${coupons.usageLimit} IS NULL OR ${coupons.usageCount} < ${coupons.usageLimit})`
          )
        )
        .returning({ id: coupons.id });
      if (updated.length === 0) {
        return { ok: false as const, error: "Coupon usage limit reached" };
      }
    }

    return {
      ok: true as const,
      code: coupon.code,
      type: coupon.type,
      discountKobo,
      subtotalKobo,
      totalKobo,
      message: "Coupon applied",
    };
  };

  if (input.reserveUsage) {
    return db.transaction(async (tx) => run(tx as unknown as typeof db));
  }
  return run(db);
}

/** Release one reserved usage (failed/expired checkout). */
export async function releaseCouponUsage(
  storeId: number,
  code: string | null | undefined
) {
  if (!code) return;
  const normalized = normalizeCouponCode(code);
  if (useMemory()) {
    mem.memReleaseCouponUsage(storeId, normalized);
    return;
  }
  const db = getDb();
  await db
    .update(coupons)
    .set({
      usageCount: sql`GREATEST(0, ${coupons.usageCount} - 1)`,
      updatedAt: new Date(),
    })
    .where(and(eq(coupons.storeId, storeId), eq(coupons.code, normalized)));
}
