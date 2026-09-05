/**
 * Pure analytics math — period bounds, rates, series fill, aggregation.
 */
export const ANALYTICS_PERIODS = [7, 30, 90] as const;
export type AnalyticsPeriodDays = (typeof ANALYTICS_PERIODS)[number];

export type AnalyticsDayPoint = {
  day: string;
  revenueKobo: number;
  orderCount: number;
  paidOrderCount: number;
};

export type AnalyticsTopProduct = {
  productId: number | null;
  name: string;
  unitsSold: number;
  revenueKobo: number;
  rank: number;
};

export type AnalyticsComparison = {
  revenueKobo: number;
  orderCount: number;
  unitsSold: number;
  aovKobo: number;
  revenueChangePct: number | null;
  orderChangePct: number | null;
  unitsChangePct: number | null;
  aovChangePct: number | null;
};

export type SellerAnalytics = {
  periodDays: number;
  range: { start: string; endExclusive: string };
  kpis: {
    revenueKobo: number;
    orderCount: number;
    paidOrderCount: number;
    pendingOrderCount: number;
    cancelledOrderCount: number;
    deliveredOrderCount: number;
    paymentAttemptedCount: number;
    unitsSold: number;
    aovKobo: number;
    paymentSuccessRate: number | null;
    fulfillmentRate: number | null;
  };
  series: AnalyticsDayPoint[];
  topProducts: AnalyticsTopProduct[];
  previous: AnalyticsComparison;
};

export function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function formatLocalDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function analyticsPeriodBounds(
  periodDays: number,
  now = new Date()
): {
  start: Date;
  endExclusive: Date;
  prevStart: Date;
  prevEndExclusive: Date;
} {
  const days = Math.max(1, Math.floor(periodDays));
  const todayStart = startOfLocalDay(now);
  const endExclusive = new Date(todayStart);
  endExclusive.setDate(endExclusive.getDate() + 1);
  const start = new Date(endExclusive);
  start.setDate(start.getDate() - days);
  const prevEndExclusive = new Date(start);
  const prevStart = new Date(prevEndExclusive);
  prevStart.setDate(prevStart.getDate() - days);
  return { start, endExclusive, prevStart, prevEndExclusive };
}

export function percentChange(
  current: number,
  previous: number
): number | null {
  if (previous === 0) {
    return current === 0 ? 0 : null;
  }
  return ((current - previous) / previous) * 100;
}

export function safeRate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return numerator / denominator;
}

export function fillDailySeries(
  start: Date,
  endExclusive: Date,
  points: Map<
    string,
    { revenueKobo: number; orderCount: number; paidOrderCount: number }
  >
): AnalyticsDayPoint[] {
  const series: AnalyticsDayPoint[] = [];
  const cursor = new Date(start);
  while (cursor < endExclusive) {
    const key = formatLocalDay(cursor);
    const hit = points.get(key);
    series.push({
      day: key,
      revenueKobo: hit?.revenueKobo ?? 0,
      orderCount: hit?.orderCount ?? 0,
      paidOrderCount: hit?.paidOrderCount ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return series;
}

export function resolveAnalyticsPeriod(
  raw: string | null | undefined
): AnalyticsPeriodDays {
  const n = Number(raw);
  if (n === 7 || n === 30 || n === 90) return n;
  return 30;
}

type OrderLike = {
  id: number;
  storeId: number;
  totalKobo: number;
  paymentStatus: string;
  orderStatus: string;
  createdAt: Date | string;
};

type ItemLike = {
  orderId: number;
  productId: number | null;
  productNameSnapshot: string;
  quantity: number;
  lineTotalKobo: number;
};

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function aggregateWindow(
  orderList: OrderLike[],
  items: ItemLike[],
  start: Date,
  endExclusive: Date
) {
  const inRange = orderList.filter((o) => {
    const t = toDate(o.createdAt).getTime();
    return t >= start.getTime() && t < endExclusive.getTime();
  });

  const paid = inRange.filter((o) => o.paymentStatus === "paid");
  const pending = inRange.filter((o) => o.paymentStatus === "pending");
  const cancelled = inRange.filter((o) => o.orderStatus === "cancelled");
  const delivered = inRange.filter(
    (o) => o.paymentStatus === "paid" && o.orderStatus === "delivered"
  );
  const attempted = inRange.filter((o) =>
    ["pending", "paid", "failed"].includes(o.paymentStatus)
  );

  const paidIds = new Set(paid.map((o) => o.id));
  const paidItems = items.filter((i) => paidIds.has(i.orderId));
  const unitsSold = paidItems.reduce((s, i) => s + i.quantity, 0);
  const revenueKobo = paid.reduce((s, o) => s + o.totalKobo, 0);
  const paidOrderCount = paid.length;
  const aovKobo =
    paidOrderCount > 0 ? Math.floor(revenueKobo / paidOrderCount) : 0;

  const byDay = new Map<
    string,
    { revenueKobo: number; orderCount: number; paidOrderCount: number }
  >();
  for (const o of inRange) {
    const key = formatLocalDay(toDate(o.createdAt));
    const cur = byDay.get(key) ?? {
      revenueKobo: 0,
      orderCount: 0,
      paidOrderCount: 0,
    };
    cur.orderCount += 1;
    if (o.paymentStatus === "paid") {
      cur.paidOrderCount += 1;
      cur.revenueKobo += o.totalKobo;
    }
    byDay.set(key, cur);
  }

  const productMap = new Map<
    string,
    {
      productId: number | null;
      name: string;
      unitsSold: number;
      revenueKobo: number;
    }
  >();
  for (const i of paidItems) {
    const key = `${i.productId ?? "x"}:${i.productNameSnapshot}`;
    const cur = productMap.get(key) ?? {
      productId: i.productId,
      name: i.productNameSnapshot || "Product",
      unitsSold: 0,
      revenueKobo: 0,
    };
    cur.unitsSold += i.quantity;
    cur.revenueKobo += i.lineTotalKobo;
    productMap.set(key, cur);
  }
  const topProducts = [...productMap.values()]
    .sort(
      (a, b) =>
        b.revenueKobo - a.revenueKobo || b.unitsSold - a.unitsSold
    )
    .slice(0, 10)
    .map((p, idx) => ({ ...p, rank: idx + 1 }));

  return {
    revenueKobo,
    orderCount: inRange.length,
    paidOrderCount,
    pendingOrderCount: pending.length,
    cancelledOrderCount: cancelled.length,
    deliveredOrderCount: delivered.length,
    paymentAttemptedCount: attempted.length,
    unitsSold,
    aovKobo,
    paymentSuccessRate: safeRate(paidOrderCount, attempted.length),
    fulfillmentRate: safeRate(delivered.length, paidOrderCount),
    series: fillDailySeries(start, endExclusive, byDay),
    topProducts,
  };
}

export function computeSellerAnalyticsFromData(
  periodDays: number,
  orderList: OrderLike[],
  items: ItemLike[],
  now = new Date()
): SellerAnalytics {
  const bounds = analyticsPeriodBounds(periodDays, now);
  const current = aggregateWindow(
    orderList,
    items,
    bounds.start,
    bounds.endExclusive
  );
  const previous = aggregateWindow(
    orderList,
    items,
    bounds.prevStart,
    bounds.prevEndExclusive
  );

  return {
    periodDays,
    range: {
      start: formatLocalDay(bounds.start),
      endExclusive: formatLocalDay(bounds.endExclusive),
    },
    kpis: {
      revenueKobo: current.revenueKobo,
      orderCount: current.orderCount,
      paidOrderCount: current.paidOrderCount,
      pendingOrderCount: current.pendingOrderCount,
      cancelledOrderCount: current.cancelledOrderCount,
      deliveredOrderCount: current.deliveredOrderCount,
      paymentAttemptedCount: current.paymentAttemptedCount,
      unitsSold: current.unitsSold,
      aovKobo: current.aovKobo,
      paymentSuccessRate: current.paymentSuccessRate,
      fulfillmentRate: current.fulfillmentRate,
    },
    series: current.series,
    topProducts: current.topProducts,
    previous: {
      revenueKobo: previous.revenueKobo,
      orderCount: previous.orderCount,
      unitsSold: previous.unitsSold,
      aovKobo: previous.aovKobo,
      revenueChangePct: percentChange(
        current.revenueKobo,
        previous.revenueKobo
      ),
      orderChangePct: percentChange(current.orderCount, previous.orderCount),
      unitsChangePct: percentChange(current.unitsSold, previous.unitsSold),
      aovChangePct: percentChange(current.aovKobo, previous.aovKobo),
    },
  };
}
