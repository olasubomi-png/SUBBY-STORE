"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type Notif = {
  id: number;
  type: string;
  title: string;
  message: string;
  href: string | null;
  read: boolean;
  createdAt: string;
};

function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-NG", {
    day: "numeric",
    month: "short",
  });
}

function typeBadge(type: string): string {
  switch (type) {
    case "payment_confirmed":
      return "Payment";
    case "order_created":
      return "Order";
    case "payment_failed":
      return "Alert";
    case "low_stock":
    case "out_of_stock":
      return "Stock";
    case "coupon_expiring":
      return "Coupon";
    default:
      return "Info";
  }
}

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/notifications?limit=40", {
        credentials: "include",
        cache: "no-store",
      });
      if (res.status === 401) {
        setError("Session expired");
        return;
      }
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body.error || "Failed to load");
        return;
      }
      setItems(
        (body.notifications || []).map(
          (n: Notif & { createdAt: string | Date }) => ({
            ...n,
            createdAt:
              typeof n.createdAt === "string"
                ? n.createdAt
                : new Date(n.createdAt).toISOString(),
          })
        )
      );
      setUnread(Number(body.unreadCount || 0));
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => void load(), 60_000);
    return () => clearInterval(id);
  }, [load]);

  async function markRead(id: number) {
    try {
      await fetch(`/api/notifications/${id}`, {
        method: "PATCH",
        credentials: "include",
      });
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
      setUnread((u) => Math.max(0, u - 1));
    } catch {
      /* ignore */
    }
  }

  async function markAll() {
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ markAllRead: true }),
      });
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notifications"
        onClick={() => {
          setOpen((o) => !o);
          if (!open) void load();
        }}
        className="relative rounded-lg p-2 text-ink-600 hover:bg-ink-100"
      >
        <span className="text-lg leading-none" aria-hidden>
          🔔
        </span>
        {unread > 0 ? (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand-600 px-1 text-[10px] font-semibold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <>
          <button
            type="button"
            className="fixed inset-0 z-30 cursor-default"
            aria-label="Close notifications"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 z-40 mt-1 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-xl border border-ink-100 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-ink-100 px-3 py-2">
              <p className="text-sm font-semibold text-ink-900">Notifications</p>
              {unread > 0 ? (
                <button
                  type="button"
                  onClick={() => void markAll()}
                  className="text-xs font-medium text-brand-700"
                >
                  Mark all read
                </button>
              ) : null}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {loading && items.length === 0 ? (
                <p className="px-3 py-6 text-center text-sm text-ink-500">
                  Loading…
                </p>
              ) : error ? (
                <div className="px-3 py-6 text-center">
                  <p className="text-sm text-ink-600">{error}</p>
                  <button
                    type="button"
                    onClick={() => void load()}
                    className="mt-2 text-xs font-medium text-brand-700"
                  >
                    Retry
                  </button>
                </div>
              ) : items.length === 0 ? (
                <p className="px-3 py-8 text-center text-sm text-ink-500">
                  No notifications yet
                </p>
              ) : (
                <ul>
                  {items.map((n) => {
                    const body = (
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[10px] font-medium uppercase text-ink-500">
                            {typeBadge(n.type)}
                          </span>
                          {!n.read ? (
                            <span className="h-1.5 w-1.5 rounded-full bg-brand-600" />
                          ) : null}
                        </div>
                        <p
                          className={`mt-0.5 text-sm ${n.read ? "text-ink-700" : "font-medium text-ink-950"}`}
                        >
                          {n.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-ink-500">
                          {n.message}
                        </p>
                        <p
                          className="mt-1 text-[11px] text-ink-400"
                          title={new Date(n.createdAt).toLocaleString()}
                        >
                          {relativeTime(n.createdAt)}
                        </p>
                      </div>
                    );
                    return (
                      <li
                        key={n.id}
                        className={`border-b border-ink-50 ${n.read ? "bg-white" : "bg-brand-50/40"}`}
                      >
                        {n.href ? (
                          <Link
                            href={n.href}
                            onClick={() => {
                              void markRead(n.id);
                              setOpen(false);
                            }}
                            className="flex gap-2 px-3 py-2.5 hover:bg-ink-50"
                          >
                            {body}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void markRead(n.id)}
                            className="flex w-full gap-2 px-3 py-2.5 text-left hover:bg-ink-50"
                          >
                            {body}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
