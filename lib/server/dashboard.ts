import { and, desc, eq, lte, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { orderItems, orders, products, stores } from "@/db/schema";

export async function getProfessionalDashboard(ownerId: number) {
  const db = getDb();

  const storeRows = await db
    .select({ id: stores.id })
    .from(stores)
    .where(eq(stores.ownerId, ownerId));

  const storeIds = storeRows.map((row) => row.id);

  if (storeIds.length === 0) {
    return {
      salesKobo: 0,
      todaySalesKobo: 0,
      orderCount: 0,
      todayOrderCount: 0,
      paidOrderCount: 0,
      pendingOrderCount: 0,
      productCount: 0,
      activeProductCount: 0,
      lowStockCount: 0,
      outOfStockCount: 0,
      customerCount: 0,
      unfulfilledOrderCount: 0,
      salesTrend: [],
      topProducts: [],
      recentOrders: [],
      lowStockProducts: [],
    };
  }

  const storeFilter = sql`${orders.storeId} IN (${sql.join(
    storeIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;

  const productStoreFilter = sql`${products.storeId} IN (${sql.join(
    storeIds.map((id) => sql`${id}`),
    sql`, `,
  )})`;

  const today = sql`CURRENT_DATE`;

  const [
    totals,
    productsTotal,
    customers,
    trend,
    topProducts,
    recentOrders,
    lowStockProducts,
  ] = await Promise.all([
    db
      .select({
        salesKobo: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentStatus} = 'paid' THEN ${orders.totalKobo} ELSE 0 END), 0)`,
        todaySalesKobo: sql<number>`COALESCE(SUM(CASE WHEN ${orders.paymentStatus} = 'paid' AND ${orders.createdAt} >= ${today} THEN ${orders.totalKobo} ELSE 0 END), 0)`,
        orderCount: sql<number>`COUNT(*)`,
        todayOrderCount: sql<number>`COUNT(*) FILTER (WHERE ${orders.createdAt} >= ${today})`,
        paidOrderCount: sql<number>`COUNT(*) FILTER (WHERE ${orders.paymentStatus} = 'paid')`,
        pendingOrderCount: sql<number>`COUNT(*) FILTER (WHERE ${orders.paymentStatus} IN ('pending', 'processing'))`,
        unfulfilledOrderCount: sql<number>`COUNT(*) FILTER (WHERE ${orders.paymentStatus} = 'paid' AND ${orders.orderStatus} NOT IN ('delivered', 'cancelled'))`,
      })
      .from(orders)
      .where(storeFilter),

    db
      .select({
        productCount: sql<number>`COUNT(*)`,
        activeProductCount: sql<number>`COUNT(*) FILTER (WHERE ${products.active} = true)`,
        lowStockCount: sql<number>`COUNT(*) FILTER (WHERE ${products.stock} > 0 AND ${products.stock} <= 5)`,
        outOfStockCount: sql<number>`COUNT(*) FILTER (WHERE ${products.stock} <= 0)`,
      })
      .from(products)
      .where(productStoreFilter),

    db
      .select({
        customerCount: sql<number>`COUNT(DISTINCT LOWER(${orders.customerEmail}))`,
      })
      .from(orders)
      .where(
        and(
          storeFilter,
          eq(orders.paymentStatus, "paid"),
          sql`${orders.customerEmail} IS NOT NULL`,
        ),
      ),

    db
      .select({
        day: sql<string>`TO_CHAR(DATE(${orders.createdAt}), 'YYYY-MM-DD')`,
        salesKobo: sql<number>`COALESCE(SUM(${orders.totalKobo}), 0)`,
        orderCount: sql<number>`COUNT(*)`,
      })
      .from(orders)
      .where(
        and(
          storeFilter,
          eq(orders.paymentStatus, "paid"),
          sql`${orders.createdAt} >= CURRENT_DATE - INTERVAL '6 days'`,
        ),
      )
      .groupBy(sql`DATE(${orders.createdAt})`)
      .orderBy(sql`DATE(${orders.createdAt}) ASC`),

    db
      .select({
        productId: orderItems.productId,
        name: orderItems.productNameSnapshot,
        quantity: sql<number>`SUM(${orderItems.quantity})`,
        revenueKobo: sql<number>`SUM(${orderItems.lineTotalKobo})`,
      })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(
        and(
          storeFilter,
          eq(orders.paymentStatus, "paid"),
          sql`${orderItems.productId} IS NOT NULL`,
        ),
      )
      .groupBy(orderItems.productId, orderItems.productNameSnapshot)
      .orderBy(desc(sql`SUM(${orderItems.lineTotalKobo})`))
      .limit(5),

    db
      .select({
        id: orders.id,
        customerName: orders.customerName,
        totalKobo: orders.totalKobo,
        paymentStatus: orders.paymentStatus,
        orderStatus: orders.orderStatus,
        createdAt: orders.createdAt,
      })
      .from(orders)
      .where(storeFilter)
      .orderBy(desc(orders.createdAt))
      .limit(8),

    db
      .select({
        id: products.id,
        name: products.name,
        stock: products.stock,
        priceKobo: products.priceKobo,
        active: products.active,
      })
      .from(products)
      .where(
        and(
          productStoreFilter,
          lte(products.stock, 5),
        ),
      )
      .orderBy(products.stock, products.name)
      .limit(8),
  ]);

  const total = totals[0] ?? {};
  const productTotal = productsTotal[0] ?? {};
  const customerTotal = customers[0] ?? {};

  return {
    salesKobo: Number(total.salesKobo ?? 0),
    todaySalesKobo: Number(total.todaySalesKobo ?? 0),
    orderCount: Number(total.orderCount ?? 0),
    todayOrderCount: Number(total.todayOrderCount ?? 0),
    paidOrderCount: Number(total.paidOrderCount ?? 0),
    pendingOrderCount: Number(total.pendingOrderCount ?? 0),
    unfulfilledOrderCount: Number(total.unfulfilledOrderCount ?? 0),

    productCount: Number(productTotal.productCount ?? 0),
    activeProductCount: Number(productTotal.activeProductCount ?? 0),
    lowStockCount: Number(productTotal.lowStockCount ?? 0),
    outOfStockCount: Number(productTotal.outOfStockCount ?? 0),

    customerCount: Number(customerTotal.customerCount ?? 0),

    salesTrend: trend.map((row) => ({
      day: row.day,
      salesKobo: Number(row.salesKobo ?? 0),
      orderCount: Number(row.orderCount ?? 0),
    })),

    topProducts: topProducts.map((row) => ({
      productId: row.productId,
      name: row.name,
      quantity: Number(row.quantity ?? 0),
      revenueKobo: Number(row.revenueKobo ?? 0),
    })),

    recentOrders,

    lowStockProducts,
  };
}
