"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { NotificationBell } from "@/components/NotificationBell";

const links = [
  { href: "/dashboard", label: "Overview", icon: "⌂", group: "main" },
  { href: "/dashboard/orders", label: "Orders", icon: "☰", group: "main" },
  { href: "/dashboard/customers", label: "Customers", icon: "☺", group: "main" },
  { href: "/dashboard/analytics", label: "Analytics", icon: "◔", group: "main" },
  { href: "/dashboard/inventory", label: "Inventory", icon: "▦", group: "catalog" },
  { href: "/dashboard/products", label: "Products", icon: "▣", group: "catalog" },
  { href: "/dashboard/coupons", label: "Coupons", icon: "%", group: "grow" },
  { href: "/dashboard/marketing", label: "Marketing", icon: "◎", group: "grow" },
  { href: "/dashboard/billing", label: "Billing", icon: "₦", group: "money" },
  { href: "/dashboard/wallet", label: "Wallet", icon: "钱包", group: "money" },
  { href: "/dashboard/settings", label: "Settings", icon: "⚙", group: "account" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function NavLink({
  href,
  label,
  icon,
  active,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: string;
  active: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition ${
        active
          ? "bg-brand-50 font-semibold text-brand-800"
          : "text-ink-600 hover:bg-ink-100 hover:text-ink-900"
      }`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white text-base shadow-sm ring-1 ring-ink-100">
        {icon === "钱包" ? "₦" : icon}
      </span>
      <span>{label}</span>
    </Link>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
        Main
      </p>
      {links
        .filter((l) => l.group === "main")
        .map((l) => (
          <NavLink
            key={l.href}
            {...l}
            active={isActive(pathname, l.href)}
            onNavigate={() => setMenuOpen(false)}
          />
        ))}
      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
        Catalog
      </p>
      {links
        .filter((l) => l.group === "catalog")
        .map((l) => (
          <NavLink
            key={l.href}
            {...l}
            active={isActive(pathname, l.href)}
            onNavigate={() => setMenuOpen(false)}
          />
        ))}
      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
        Grow
      </p>
      {links
        .filter((l) => l.group === "grow")
        .map((l) => (
          <NavLink
            key={l.href}
            {...l}
            active={isActive(pathname, l.href)}
            onNavigate={() => setMenuOpen(false)}
          />
        ))}
      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
        Money
      </p>
      {links
        .filter((l) => l.group === "money")
        .map((l) => (
          <NavLink
            key={l.href}
            {...l}
            active={isActive(pathname, l.href)}
            onNavigate={() => setMenuOpen(false)}
          />
        ))}
      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-ink-400">
        Account
      </p>
      {links
        .filter((l) => l.group === "account")
        .map((l) => (
          <NavLink
            key={l.href}
            {...l}
            active={isActive(pathname, l.href)}
            onNavigate={() => setMenuOpen(false)}
          />
        ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-ink-50 lg:flex">
      {/* Desktop sidebar — always visible */}
      <aside className="hidden w-60 shrink-0 border-r border-ink-100 bg-white lg:fixed lg:inset-y-0 lg:flex lg:flex-col">
        <div className="flex h-14 items-center border-b border-ink-100 px-4">
          <Link href="/dashboard" className="font-semibold tracking-tight text-ink-950">
            SUBBY STORE
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="border-t border-ink-100 p-3">
          <button
            type="button"
            onClick={logout}
            className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink-500 hover:bg-ink-100 hover:text-ink-800"
          >
            Log out
          </button>
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-60">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-ink-100 bg-white/95 backdrop-blur">
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-ink-100 bg-white text-ink-700 lg:hidden"
                aria-label="Open menu"
                onClick={() => setMenuOpen(true)}
              >
                <span className="text-lg leading-none">☰</span>
              </button>
              <Link
                href="/dashboard"
                className="font-semibold text-ink-950 lg:hidden"
              >
                SUBBY STORE
              </Link>
              <span className="hidden text-sm text-ink-400 lg:inline">
                Dashboard
              </span>
            </div>
            <div className="flex items-center gap-1">
              <NotificationBell />
              <button
                type="button"
                onClick={logout}
                className="hidden text-sm text-ink-500 hover:text-ink-800 sm:inline lg:hidden"
              >
                Log out
              </button>
            </div>
          </div>

          {/* Mobile quick strip — key areas always visible */}
          <div className="flex gap-1 overflow-x-auto border-t border-ink-50 px-2 py-2 lg:hidden">
            {links
              .filter((l) =>
                ["Overview", "Orders", "Products", "Wallet", "Settings"].includes(
                  l.label
                )
              )
              .map((l) => {
                const active = isActive(pathname, l.href);
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                      active
                        ? "bg-brand-600 text-white"
                        : "bg-ink-100 text-ink-600"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="shrink-0 rounded-full bg-ink-100 px-3 py-1.5 text-xs font-medium text-ink-600"
            >
              All →
            </button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</main>
      </div>

      {/* Mobile full menu drawer */}
      {menuOpen ? (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-ink-950/40"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-[min(100%,18rem)] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-ink-100 px-4">
              <span className="font-semibold text-ink-950">All sections</span>
              <button
                type="button"
                className="rounded-lg px-2 py-1 text-sm text-ink-500"
                onClick={() => setMenuOpen(false)}
              >
                Close
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">{nav}</div>
            <div className="border-t border-ink-100 p-3">
              <button
                type="button"
                onClick={logout}
                className="w-full rounded-xl px-3 py-2 text-left text-sm text-ink-500 hover:bg-ink-100"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
