"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AlertTriangle, Bell, LogOut, Menu, X } from "lucide-react";
import { useAuth, ROLE_HOME } from "@/lib/auth";
import { NAV, ROLE_PREFIX } from "@/lib/nav";
import { cn, initials } from "@/lib/utils";
import type { Role } from "@/types/api";
import { GlobalSearch } from "./global-search";
import { Skeleton } from "@/components/ui/states";

export function DemoBanner() {
  return null;
}

export function BrandBlock({ compact = false, dark = true }: { compact?: boolean; dark?: boolean }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-md border text-[10px] font-bold leading-none tracking-wider",
          dark ? "border-white/25 bg-white/5 text-white" : "border-navy-900 text-navy-900",
        )}
        aria-hidden
      >
        <span>NIE</span>
        <span>LIT</span>
      </div>
      <div className="min-w-0">
        <p className={cn("text-[15px] font-bold tracking-[0.12em]", dark ? "text-white" : "text-navy-900")}>NIELIT</p>
        {!compact && (
          <p className={cn("text-[10.5px] leading-snug", dark ? "text-white/65" : "text-muted")}>
            National Institute of Electronics &amp; Information Technology
          </p>
        )}
      </div>
    </div>
  );
}

function Sidebar({ role, open, onClose }: { role: Role; open: boolean; onClose: () => void }) {
  const pathname = usePathname();
  return (
    <>
      <div
        className={cn("fixed inset-0 z-30 bg-navy-950/40 lg:hidden", open ? "block" : "hidden")}
        onClick={onClose}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-[248px] flex-col bg-navy-900 text-white transition-transform lg:sticky lg:top-0 lg:z-0 lg:h-screen lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
        aria-label="Primary navigation"
      >
        <div className="relative flex items-start justify-between border-b border-white/10 px-4 pb-4 pt-4">
          <div className="flex items-center gap-3">
            <img src="/iconnect-icon-white.png" alt="I-Connect" className="h-9 w-9 shrink-0 object-contain" />
            <div className="min-w-0">
              <p className="text-[9px] font-semibold uppercase tracking-widest text-amber-400">Powered by</p>
              <p className="text-[12px] font-bold leading-tight text-white">I-CONNECTRESOURCES</p>
              <p className="text-[9.5px] font-medium leading-tight text-white/60">INTERNATIONAL PRIVATE LIMITED</p>
              <p className="mt-1 text-[9px] leading-snug text-white/40">Strengthening Digital Security<br />through Specialized Training</p>
            </div>
          </div>
          <button className="mt-0.5 rounded p-1 text-white/70 hover:bg-white/10 lg:hidden" onClick={onClose} aria-label="Close menu">
            <X className="h-4 w-4" />
          </button>
        </div>
        <nav className="scroll-thin flex-1 overflow-y-auto px-2 py-3">
          {NAV[role].map((group, gi) => (
            <div key={gi} className="mb-3">
              {group.label && (
                <p className="px-2.5 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-white/40">{group.label}</p>
              )}
              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  const active = pathname === item.href || (item.href !== ROLE_HOME[role] && pathname.startsWith(item.href + "/"));
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onClose}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] transition-colors",
                          active
                            ? "bg-white text-navy-900 font-semibold"
                            : "text-white/80 hover:bg-white/10 hover:text-white",
                        )}
                        aria-current={active ? "page" : undefined}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 px-4 py-3">
          <p className="text-[9px] uppercase tracking-widest text-white/30">Powered by</p>
          <p className="mt-0.5 text-[10px] font-semibold text-white/55">I-Connectresources International Pvt. Ltd.</p>
          <p className="mt-0.5 text-[10px] leading-snug text-white/35">Learning delivered via NDU · v0.9</p>
        </div>
      </aside>
    </>
  );
}

function Topbar({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const [menu, setMenu] = React.useState(false);
  if (!user) return null;
  const prefix = ROLE_PREFIX[user.role];
  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur">
      <button className="rounded p-1.5 text-ink hover:bg-canvas lg:hidden" onClick={onMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </button>
      <GlobalSearch />
      <div className="ml-auto flex items-center gap-1.5">
        <Link
          href={`${prefix}/notifications`}
          className="relative rounded-md p-2 text-muted hover:bg-canvas hover:text-ink"
          aria-label={`Notifications${user.unread_notifications ? `, ${user.unread_notifications} unread` : ""}`}
        >
          <Bell className="h-[18px] w-[18px]" />
          {user.unread_notifications > 0 && (
            <span className="tabular absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-bad px-1 text-[10px] font-semibold text-white">
              {user.unread_notifications > 99 ? "99+" : user.unread_notifications}
            </span>
          )}
        </Link>
        <div className="relative">
          <button
            className="flex items-center gap-2 rounded-md py-1 pl-1 pr-2 hover:bg-canvas"
            onClick={() => setMenu((m) => !m)}
            aria-haspopup="menu"
            aria-expanded={menu}
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy-900 text-[12px] font-semibold text-white">
              {initials(user.full_name)}
            </span>
            <span className="hidden text-left md:block">
              <span className="block text-[12.5px] font-semibold leading-tight text-ink">{user.full_name}</span>
              <span className="block text-[11px] leading-tight text-muted">
                {user.role_name}
                {user.department_code ? ` · ${user.department_code}` : ""}
              </span>
            </span>
          </button>
          {menu && (
            <div
              className="absolute right-0 top-11 z-30 w-64 rounded-md border border-line bg-white py-1 shadow-lg"
              role="menu"
              onMouseLeave={() => setMenu(false)}
            >
              <div className="border-b border-line px-3 py-2">
                <p className="text-[12.5px] font-semibold">{user.full_name}</p>
                <p className="text-[11.5px] text-muted">{user.email}</p>
                {user.department && <p className="mt-0.5 text-[11.5px] text-muted">{user.department}</p>}
              </div>
              {user.role === "LEARNER" && (
                <Link href="/learner/profile" className="block px-3 py-2 text-[13px] hover:bg-canvas" role="menuitem" onClick={() => setMenu(false)}>
                  My profile
                </Link>
              )}
              <button
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-bad hover:bg-canvas"
                onClick={logout}
                role="menuitem"
              >
                <LogOut className="h-4 w-4" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export function PortalShell({ role, children }: { role: Role; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (loading) return;
    if (!user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    else if (user.role !== role) router.replace(ROLE_HOME[user.role]);
  }, [user, loading, role, router, pathname]);

  if (loading || !user || user.role !== role) {
    return (
      <div className="min-h-screen">
        <DemoBanner />
        <div className="mx-auto max-w-6xl space-y-4 p-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-28" />
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <DemoBanner />
      <div className="flex">
        <Sidebar role={role} open={open} onClose={() => setOpen(false)} />
        <div className="min-w-0 flex-1">
          <Topbar onMenu={() => setOpen(true)} />
          <main id="main" className="mx-auto max-w-[1440px] px-4 py-5 md:px-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
