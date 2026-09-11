import { NextResponse } from "next/server";
import { z } from "zod";
import { getStoreBySlug, createPendingOrder } from "@/lib/server/repo";
import { validateCouponForCart } from "@/lib/server/coupons";
import { mergeCartItems } from "@/lib/server/cart";
import { getDb } from "@/db/client";
import { products } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import { lineTotalKobo, sumKobo } from "@/lib/money";

const schema = z.object({
  storeSlug: z.string().min(1),
  code: z.string().min(1).max(40),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      })
    )
    .min(1),
  customerEmail: z.string().email().optional(),
});

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid" },
      { status: 400 }
    );
  }

  const store = await getStoreBySlug(parsed.data.storeSlug);
  if (!store) {
    return NextResponse.json({ error: "Store not found" }, { status: 404 });
  }

  try {
    const merged = mergeCartItems(parsed.data.items);
    // Server-price lines
    let lines: Array<{ productId: number; lineTotalKobo: number }> = [];
    if (useMemory()) {
      const priced = mem.memPriceCart(store.id, merged);
      lines = priced.lines.map((l) => ({
        productId: l.productId,
        lineTotalKobo: l.lineTotalKobo,
      }));
    } else {
      const db = getDb();
      const ids = merged.map((i) => i.productId);
      const rows = await db
        .select()
        .from(products)
        .where(
          and(eq(products.storeId, store.id), inArray(products.id, ids))
        );
      const byId = new Map(rows.map((r) => [r.id, r]));
      for (const item of merged) {
        const p = byId.get(item.productId);
        if (!p || !p.active) throw new Error("Invalid product");
        lines.push({
          productId: p.id,
          lineTotalKobo: lineTotalKobo(p.priceKobo, item.quantity),
        });
      }
    }

    const result = await validateCouponForCart({
      storeId: store.id,
      code: parsed.data.code,
      lines,
      customerEmail: parsed.data.customerEmail,
      reserveUsage: false,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({
      code: result.code,
      discountKobo: result.discountKobo,
      subtotalKobo: result.subtotalKobo,
      totalKobo: result.totalKobo,
      message: result.message,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Validation failed";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
