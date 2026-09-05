import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  analyticsPeriodBounds,
  computeSellerAnalyticsFromData,
  percentChange,
  safeRate,
  fillDailySeries,
  formatLocalDay,
  startOfLocalDay,
} from "@/lib/analytics-math";
import {
  resetMemoryStore,
  memSignup,
  memCreateStore,
  memCreateProduct,
  memCreatePendingOrder,
  memConfirmPaidOrder,
  memGetSellerAnalytics,
  getMemoryStore,
} from "@/lib/server/memory-repo";

describe("analytics math", () => {
  it("period bounds cover exact day counts and previous window", () => {
    const now = new Date(2026, 8, 10, 15, 30); // Sept 10 2026 local
    const b = analyticsPeriodBounds(7, now);
    expect(formatLocalDay(b.start)).toBe("2026-09-04");
    expect(formatLocalDay(b.endExclusive)).toBe("2026-09-11");
    expect(formatLocalDay(b.prevStart)).toBe("2026-08-28");
    expect(formatLocalDay(b.prevEndExclusive)).toBe("2026-09-04");
  });

  it("percentChange avoids Infinity", () => {
    expect(percentChange(100, 0)).toBeNull();
    expect(percentChange(0, 0)).toBe(0);
    expect(percentChange(150, 100)).toBe(50);
  });

  it("safeRate handles zero denominator", () => {
    expect(safeRate(1, 0)).toBeNull();
    expect(safeRate(1, 2)).toBe(0.5);
  });

  it("fillDailySeries includes zero days", () => {
    const start = startOfLocalDay(new Date(2026, 0, 1));
    const end = new Date(2026, 0, 4); // exclusive Jan 4 → 3 days
    const map = new Map([
      ["2026-01-02", { revenueKobo: 50000, orderCount: 1, paidOrderCount: 1 }],
    ]);
    const series = fillDailySeries(start, end, map);
    expect(series).toHaveLength(3);
    expect(series[0].revenueKobo).toBe(0);
    expect(series[1].revenueKobo).toBe(50000);
    expect(series[2].revenueKobo).toBe(0);
  });

  it("unpaid orders do not contribute to revenue or units", () => {
    const now = new Date(2026, 8, 5, 12);
    const orders = [
      {
        id: 1,
        storeId: 1,
        totalKobo: 10000,
        paymentStatus: "paid",
        orderStatus: "confirmed",
        createdAt: new Date(2026, 8, 4, 10),
      },
      {
        id: 2,
        storeId: 1,
        totalKobo: 99999,
        paymentStatus: "pending",
        orderStatus: "pending",
        createdAt: new Date(2026, 8, 4, 11),
      },
    ];
    const items = [
      {
        orderId: 1,
        productId: 1,
        productNameSnapshot: "A",
        quantity: 2,
        lineTotalKobo: 10000,
      },
      {
        orderId: 2,
        productId: 1,
        productNameSnapshot: "A",
        quantity: 50,
        lineTotalKobo: 99999,
      },
    ];
    const a = computeSellerAnalyticsFromData(7, orders, items, now);
    expect(a.kpis.revenueKobo).toBe(10000);
    expect(a.kpis.unitsSold).toBe(2);
    expect(a.kpis.paidOrderCount).toBe(1);
    expect(a.kpis.orderCount).toBe(2);
    expect(a.kpis.aovKobo).toBe(10000);
  });

  it("uses product name snapshot when productId is null", () => {
    const now = new Date(2026, 8, 5, 12);
    const orders = [
      {
        id: 1,
        storeId: 1,
        totalKobo: 5000,
        paymentStatus: "paid",
        orderStatus: "delivered",
        createdAt: new Date(2026, 8, 3),
      },
    ];
    const items = [
      {
        orderId: 1,
        productId: null,
        productNameSnapshot: "Deleted SKU",
        quantity: 1,
        lineTotalKobo: 5000,
      },
    ];
    const a = computeSellerAnalyticsFromData(7, orders, items, now);
    expect(a.topProducts[0].name).toBe("Deleted SKU");
    expect(a.kpis.fulfillmentRate).toBe(1);
  });
});

describe("memory seller isolation", () => {
  beforeEach(() => {
    resetMemoryStore();
    process.env.USE_MEMORY_DB = "1";
    (process.env as { NODE_ENV?: string }).NODE_ENV = "test";
  });
  afterEach(() => resetMemoryStore());

  it("seller cannot see another seller analytics", async () => {
    const a = await memSignup({
      email: "a@ex.com",
      password: "password12",
      fullName: "A",
    });
    const b = await memSignup({
      email: "b@ex.com",
      password: "password12",
      fullName: "B",
    });
    const sa = memCreateStore({ ownerId: a.id, name: "Store A" });
    const sb = memCreateStore({ ownerId: b.id, name: "Store B" });
    const pa = memCreateProduct({
      ownerId: a.id,
      storeId: sa.id,
      name: "A Item",
      priceKobo: 10000,
      stock: 10,
    });
    const pb = memCreateProduct({
      ownerId: b.id,
      storeId: sb.id,
      name: "B Item",
      priceKobo: 20000,
      stock: 10,
    });
    await memCreatePendingOrder({
      storeId: sa.id,
      customerName: "C",
      customerPhone: "080",
      customerEmail: "c@ex.com",
      deliveryAddress: "Lagos",
      items: [{ productId: pa.id, quantity: 1 }],
      paymentReference: "ref_a",
    });
    memConfirmPaidOrder("ref_a", 10000);
    await memCreatePendingOrder({
      storeId: sb.id,
      customerName: "D",
      customerPhone: "081",
      customerEmail: "d@ex.com",
      deliveryAddress: "Abuja",
      items: [{ productId: pb.id, quantity: 1 }],
      paymentReference: "ref_b",
    });
    memConfirmPaidOrder("ref_b", 20000);

    const analyticsA = memGetSellerAnalytics(a.id, 30);
    const analyticsB = memGetSellerAnalytics(b.id, 30);
    expect(analyticsA.kpis.revenueKobo).toBe(10000);
    expect(analyticsB.kpis.revenueKobo).toBe(20000);
    expect(analyticsA.topProducts[0]?.name).toBe("A Item");
    expect(analyticsB.topProducts[0]?.name).toBe("B Item");
  });

  it("empty seller returns zeros without crashing", async () => {
    const u = await memSignup({
      email: "empty@ex.com",
      password: "password12",
      fullName: "Empty",
    });
    const a = memGetSellerAnalytics(u.id, 7);
    expect(a.kpis.revenueKobo).toBe(0);
    expect(a.series).toHaveLength(7);
    expect(a.series.every((d) => d.revenueKobo === 0)).toBe(true);
    expect(a.topProducts).toHaveLength(0);
  });
});
