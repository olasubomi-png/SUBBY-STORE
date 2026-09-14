/**
 * Seller customer management derived from order data.
 * No separate customer table — identity is email (preferred) or normalized phone.
 * All queries must be scoped to stores owned by the authenticated seller.
 */
import { eq, inArray, desc } from "drizzle-orm";
import { getDb } from "@/db/client";
import { orders, orderItems, stores } from "@/db/schema";
import { useMemory } from "@/lib/server/repo";
import * as mem from "@/lib/server/memory-repo";
import {
  type CustomerType,
  type CustomerSummary,
  type CustomerDetail,
  type CustomerOrderLine,
  type CustomerInsights,
  digitsOnly,
} from "@/lib/customers/types";

export type {
  CustomerType,
  CustomerSummary,
  CustomerDetail,
  CustomerOrderLine,
  CustomerInsights,
} from "@/lib/customers/types";
export { customerContactLinks } from "@/lib/customers/types";

/** Paid revenue threshold for VIP classification (₦50,000). */
export const VIP_SPEND_KOBO = 5_000_000;
/** Or VIP if at least this many paid orders. */
export const VIP_ORDER_COUNT = 5;

export function classifyCustomer(
  paidOrders: number,
  totalSpentKobo: number
): CustomerType {
  if (totalSpentKobo >= VIP_SPEND_KOBO || paidOrders >= VIP_ORDER_COUNT) {
    return "vip";
  }
  if (paidOrders >= 2) return "returning";
  return "new";
}

export function customerIdentityKey(
  email: string | null | undefined,
  phone: string | null | undefined
): string | null {
  const e = (email || "").trim().toLowerCase();
  if (e && e.includes("@")) return `e:${e}`;
  const p = digitsOnly(phone || "");
  if (p.length >= 7) return `p:${p}`;
  return null;
}

type RawOrder = {
  id: number;
  storeId: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  paymentStatus: string;
  orderStatus: string;
  totalKobo: number;
  paymentReference: string | null;
  createdAt: Date | string;
};

async function ownerStoreIds(ownerId: number): Promise<number[]> {
  if (useMemory()) {
    return mem
      .getMemoryStore()
      .stores.filter((s) => s.ownerId === ownerId)
      .map((s) => s.id);
  }
  const db = getDb();
  const rows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, ownerId));
  return rows.map((r) => r.id);
}

async function loadOrdersForOwner(ownerId: number): Promise<RawOrder[]> {
  if (useMemory()) {
    const storeIds = await ownerStoreIds(ownerId);
    return mem
      .getMemoryStore()
      .orders.filter((o) => storeIds.includes(o.storeId))
      .map((o) => ({
        ...o,
        paymentReference: o.paymentReference ?? null,
      }));
  }
  const db = getDb();
  const storeIds = await ownerStoreIds(ownerId);
  if (storeIds.length === 0) return [];
  const rows = await db
    .select()
    .from(orders)
    .where(inArray(orders.storeId, storeIds))
    .orderBy(desc(orders.createdAt));
  return rows;
}

function aggregate(orderList: RawOrder[]): CustomerSummary[] {
  const map = new Map<
    string,
    {
      name: string;
      email: string | null;
      phone: string | null;
      totalOrders: number;
      paidOrders: number;
      totalSpentKobo: number;
      firstOrderAt: Date;
      lastOrderAt: Date;
    }
  >();

  for (const o of orderList) {
    const key = customerIdentityKey(o.customerEmail, o.customerPhone);
    if (!key) continue;
    const created =
      o.createdAt instanceof Date ? o.createdAt : new Date(o.createdAt);
    const email = o.customerEmail?.trim() || null;
    const phone = o.customerPhone?.trim() || null;
    const existing = map.get(key);
    const isPaid = o.paymentStatus === "paid";
    if (!existing) {
      map.set(key, {
        name: o.customerName.trim() || "Customer",
        email,
        phone,
        totalOrders: 1,
        paidOrders: isPaid ? 1 : 0,
        totalSpentKobo: isPaid ? o.totalKobo : 0,
        firstOrderAt: created,
        lastOrderAt: created,
      });
    } else {
      existing.totalOrders += 1;
      if (isPaid) {
        existing.paidOrders += 1;
        existing.totalSpentKobo += o.totalKobo;
      }
      if (created < existing.firstOrderAt) existing.firstOrderAt = created;
      if (created > existing.lastOrderAt) {
        existing.lastOrderAt = created;
        // Prefer most recent name/contact
        existing.name = o.customerName.trim() || existing.name;
        if (email) existing.email = email;
        if (phone) existing.phone = phone;
      }
    }
  }

  const list: CustomerSummary[] = [];
  for (const [key, v] of map) {
    list.push({
      key,
      name: v.name,
      email: v.email,
      phone: v.phone,
      totalOrders: v.totalOrders,
      paidOrders: v.paidOrders,
      totalSpentKobo: v.totalSpentKobo,
      firstOrderAt: v.firstOrderAt.toISOString(),
      lastOrderAt: v.lastOrderAt.toISOString(),
      type: classifyCustomer(v.paidOrders, v.totalSpentKobo),
    });
  }

  list.sort(
    (a, b) =>
      new Date(b.lastOrderAt).getTime() - new Date(a.lastOrderAt).getTime()
  );
  return list;
}

export function computeCustomerInsights(
  customers: CustomerSummary[]
): CustomerInsights {
  const totalCustomers = customers.length;
  const newCustomers = customers.filter((c) => c.type === "new").length;
  const returningCustomers = customers.filter(
    (c) => c.type === "returning" || c.type === "vip"
  ).length;
  const vipCustomers = customers.filter((c) => c.type === "vip").length;
  const totalRevenueKobo = customers.reduce(
    (s, c) => s + c.totalSpentKobo,
    0
  );
  const paidOrders = customers.reduce((s, c) => s + c.paidOrders, 0);
  const averageOrderValueKobo =
    paidOrders > 0 ? Math.round(totalRevenueKobo / paidOrders) : 0;
  const repeatPurchaseRate =
    totalCustomers > 0
      ? customers.filter((c) => c.paidOrders >= 2).length / totalCustomers
      : null;

  return {
    totalCustomers,
    newCustomers,
    returningCustomers,
    vipCustomers,
    totalRevenueKobo,
    averageOrderValueKobo,
    repeatPurchaseRate,
  };
}

export async function listCustomersForOwner(
  ownerId: number
): Promise<{ customers: CustomerSummary[]; insights: CustomerInsights }> {
  const orderList = await loadOrdersForOwner(ownerId);
  const customers = aggregate(orderList);
  return { customers, insights: computeCustomerInsights(customers) };
}

export async function getCustomerDetailForOwner(
  ownerId: number,
  customerKey: string
): Promise<CustomerDetail | null> {
  const orderList = await loadOrdersForOwner(ownerId);
  const customers = aggregate(orderList);
  const summary = customers.find((c) => c.key === customerKey);
  if (!summary) return null;

  const matched = orderList
    .filter((o) => {
      const k = customerIdentityKey(o.customerEmail, o.customerPhone);
      return k === customerKey;
    })
    .sort((a, b) => {
      const ta =
        a.createdAt instanceof Date
          ? a.createdAt.getTime()
          : new Date(a.createdAt).getTime();
      const tb =
        b.createdAt instanceof Date
          ? b.createdAt.getTime()
          : new Date(b.createdAt).getTime();
      return tb - ta;
    });

  const productMap = new Map<string, number>();
  const detailOrders: CustomerOrderLine[] = [];

  for (const o of matched) {
    let items: Array<{
      productName: string;
      quantity: number;
      lineTotalKobo: number;
    }> = [];

    if (useMemory()) {
      items = mem
        .getMemoryStore()
        .orderItems.filter((i) => i.orderId === o.id)
        .map((i) => ({
          productName: i.productNameSnapshot,
          quantity: i.quantity,
          lineTotalKobo: i.lineTotalKobo,
        }));
    } else {
      const db = getDb();
      const rows = await db
        .select()
        .from(orderItems)
        .where(eq(orderItems.orderId, o.id));
      items = rows.map((i) => ({
        productName: i.productNameSnapshot,
        quantity: i.quantity,
        lineTotalKobo: i.lineTotalKobo,
      }));
    }

    for (const it of items) {
      productMap.set(
        it.productName,
        (productMap.get(it.productName) || 0) + it.quantity
      );
    }

    detailOrders.push({
      id: o.id,
      paymentReference: o.paymentReference,
      paymentStatus: o.paymentStatus,
      orderStatus: o.orderStatus,
      totalKobo: o.totalKobo,
      createdAt:
        o.createdAt instanceof Date
          ? o.createdAt.toISOString()
          : new Date(o.createdAt).toISOString(),
      items,
    });
  }

  const products = [...productMap.entries()]
    .map(([productName, quantity]) => ({ productName, quantity }))
    .sort((a, b) => b.quantity - a.quantity);

  return {
    ...summary,
    orders: detailOrders,
    products,
  };
}

