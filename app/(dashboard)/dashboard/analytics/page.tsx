"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatNgn } from "@/lib/money";
import type { SellerAnalytics } from "@/lib/analytics-math";
import { ANALYTICS_PERIODS } from "@/lib/analytics-math";

function formatPct(value: number | null): string {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatRate(value: number | null): string {
  if (value === null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

function changeClass(value: number | null): string {
  if (value === null || value === 0) return "text-ink-400";
  return value > 0 ? "text-emerald-700" : "text-red-600";
}

function shortDayLabel(day: string): string {
  const d = new Date(`${day}T12:00:00`);
  if (Number.isNaN(d.getTime())) return day.slice(5);
  return d.toLocaleDateString("en-NG", { day: "numeric", month: "short" });
}

function MiniBarChart({
  series,
  valueKey,
  ariaLabel,
}: {
  series: SellerAnalytics["series"];
  valueKey: "revenueKobo" | "paidOrderCount";
  ariaLabel: string;
}) {
  const max = Math.max(1, ...series.map((p) => p[valueKey]));
  const height = 140;
  const gap = 2;
  const barW =
    series.length > 0 ? Math.max(2, (100 - series.length * gap) / series.length) : 4;

  return (
    <div className="w-full" role="img" aria-label={ariaLabel}>
      <svg
        viewBox={`0 0 100 ${height + 24}`}
        className="h-44 w-full"
        preserveAspectRatio="none"
      >
        {series.map((p, i) => {
          const v = p[valueKey];
          const h = (v / max) * height;
          const x = i * (barW + gap);
          const y = height - h;
          return (
            <rect
              key={p.day}
              x={x}
              y={y}
              width={barW}
              height={Math.max(h, v > 0 ? 1.5 : 0)}
              rx={0.8}
              className="fill-brand-600/90"
            >
              <title>
                {p.day}:{" "}
                {valueKey === "revenueKobo"
                  ? formatNgn(v)
                  : `${v} paid order${v === 1 ? "" : "s"}`}
              </title>
            </rect>
          );
        })}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-ink-400">
        <span>{series[0] ? shortDayLabel(series[0].day) : ""}</span>
        <span>
          {series.length
            ? shortDayLabel(series[series.length - 1].day)
            : ""}
        </span>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [period, setPeriod] = useState<number>(30);
  const [data, setData] = useState<SellerAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/analytics?period=${days}`,
        { credentials: "include", cache: "no-store" }
      );
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        setError("Your session has expired. Please log in again.");
        setData(null);
        return;
      }
      if (!res.ok) {
        setError(
          typeof body.error === "string"
            ? body.error
            : `Could not load analytics (${res.status})`
        );
        setData(null);
        return;
      }
      if (!body.analytics || typeof body.analytics !== "object") {
        setError("Invalid analytics response");
        setData(null);
        return;
      }
      setData(body.analytics as SellerAnalytics);
    } catch {
      setError("Network error. Check your connection and try again.");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(period);
  }, [load, period]);

  const kpis = data?.kpis;

  const cards = useMemo(() => {
    if (!kpis || !data) return [];
    return [
      {
        label: "Revenue",
        value: formatNgn(kpis.revenueKobo),
        change: data.previous.revenueChangePct,
        hint: "Paid only",
      },
      {
        label: "Orders",
        value: String(kpis.orderCount),
        change: data.previous.orderChangePct,
        hint: "All statuses",
      },
      {
        label: "Avg. order value",
        value: formatNgn(kpis.aovKobo),
        change: data.previous.aovChangePct,
        hint: "Paid revenue ÷ paid orders",
      },
      {
        label: "Units sold",
        value: String(kpis.unitsSold),
        change: data.previous.unitsChangePct,
        hint: "Paid order items",
      },
      {
        label: "Payment success",
        value: formatRate(kpis.paymentSuccessRate),
        change: null as number | null,
        hint: "Paid ÷ payment attempts",
      },
      {
        label: "Fulfillment rate",
        value: formatRate(kpis.fulfillmentRate),
        change: null as number | null,
        hint: "Delivered ÷ paid",
      },
    ];
  }, [kpis, data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink-950">Analytics</h1>
          <p className="mt-1 text-sm text-ink-500">
            Performance for your stores over the selected period.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
            {ANALYTICS_PERIODS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setPeriod(d)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium ${
                  period === d
                    ? "bg-brand-50 text-brand-800"
                    : "text-ink-500 hover:text-ink-800"
                }`}
              >
                {d} Days
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load(period)}
            disabled={loading}
            className="rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-800 hover:bg-ink-50 disabled:opacity-60"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {loading && !data ? (
        <p className="text-sm text-ink-500">Loading analytics…</p>
      ) : error ? (
        <div className="rounded-xl border border-ink-100 bg-white p-6 text-center">
          <p className="font-medium text-ink-900">Could not load analytics</p>
          <p className="mt-1 text-sm text-ink-500">{error}</p>
          <button
            type="button"
            onClick={() => void load(period)}
            className="mt-4 rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-800"
          >
            Try again
          </button>
        </div>
      ) : data && kpis ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {cards.map((c) => (
              <div
                key={c.label}
                className="rounded-xl border border-ink-100 bg-white p-4"
              >
                <p className="text-xs uppercase tracking-wide text-ink-400">
                  {c.label}
                </p>
                <p className="mt-2 text-lg font-semibold tabular-nums text-ink-950">
                  {c.value}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {c.change !== null ? (
                    <span className={changeClass(c.change)}>
                      {formatPct(c.change)} vs prior
                    </span>
                  ) : null}
                  <span className="text-ink-400">{c.hint}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-ink-100 bg-white p-4">
              <h2 className="text-sm font-semibold text-ink-900">
                Paid revenue
              </h2>
              <p className="text-xs text-ink-400">Daily · last {period} days</p>
              {data.series.every((p) => p.revenueKobo === 0) ? (
                <p className="mt-8 text-center text-sm text-ink-400">
                  No paid revenue in this period.
                </p>
              ) : (
                <div className="mt-3">
                  <MiniBarChart
                    series={data.series}
                    valueKey="revenueKobo"
                    ariaLabel="Daily paid revenue chart"
                  />
                </div>
              )}
            </section>

            <section className="rounded-xl border border-ink-100 bg-white p-4">
              <h2 className="text-sm font-semibold text-ink-900">
                Paid orders
              </h2>
              <p className="text-xs text-ink-400">Daily · last {period} days</p>
              {data.series.every((p) => p.paidOrderCount === 0) ? (
                <p className="mt-8 text-center text-sm text-ink-400">
                  No paid orders in this period.
                </p>
              ) : (
                <div className="mt-3">
                  <MiniBarChart
                    series={data.series}
                    valueKey="paidOrderCount"
                    ariaLabel="Daily paid orders chart"
                  />
                </div>
              )}
            </section>
          </div>

          <section className="rounded-xl border border-ink-100 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-900">Performance</h2>
            <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Paid orders", String(kpis.paidOrderCount)],
                ["Pending payment", String(kpis.pendingOrderCount)],
                ["Cancelled", String(kpis.cancelledOrderCount)],
                ["Delivered", String(kpis.deliveredOrderCount)],
                ["Units sold", String(kpis.unitsSold)],
                ["AOV", formatNgn(kpis.aovKobo)],
                ["Payment success", formatRate(kpis.paymentSuccessRate)],
                ["Fulfillment", formatRate(kpis.fulfillmentRate)],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg bg-ink-50 px-3 py-2">
                  <dt className="text-xs text-ink-400">{label}</dt>
                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-ink-900">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-ink-100 bg-white p-4">
            <h2 className="text-sm font-semibold text-ink-900">Top products</h2>
            <p className="text-xs text-ink-400">
              By paid revenue · last {period} days
            </p>
            {data.topProducts.length === 0 ? (
              <p className="mt-6 text-center text-sm text-ink-400">
                No paid product sales in this period.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-ink-100">
                {data.topProducts.map((p) => (
                  <li
                    key={`${p.rank}-${p.productId}-${p.name}`}
                    className="flex items-center justify-between gap-3 py-3 text-sm"
                  >
                    <div className="min-w-0 flex items-center gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-50 text-xs font-semibold text-ink-600">
                        {p.rank}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate font-medium text-ink-900">
                          {p.name}
                        </p>
                        <p className="text-xs text-ink-400">
                          {p.unitsSold} unit{p.unitsSold === 1 ? "" : "s"}
                        </p>
                      </div>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-ink-950">
                      {formatNgn(p.revenueKobo)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}
