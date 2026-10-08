import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  href,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "warn" | "bad" | "ok";
  href?: string;
}) {
  const accent = {
    default: "before:bg-brand-600",
    ok: "before:bg-ok",
    warn: "before:bg-saffron",
    bad: "before:bg-bad",
  }[tone];
  const body = (
    <div
      className={cn(
        "relative h-full overflow-hidden rounded-lg border border-line bg-white px-4 py-3.5 before:absolute before:inset-y-0 before:left-0 before:w-[3px]",
        accent,
        href && "transition-colors hover:border-brand-500",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-subtle" aria-hidden />}
      </div>
      <p className="tabular mt-1.5 text-[26px] font-semibold leading-none text-navy-900">{value}</p>
      {sub && <p className="mt-1.5 text-[12px] text-muted">{sub}</p>}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

export function KpiGrid({ children, cols = 5 }: { children: React.ReactNode; cols?: 4 | 5 | 6 }) {
  const c = { 4: "xl:grid-cols-4", 5: "xl:grid-cols-5", 6: "xl:grid-cols-6" }[cols];
  return <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3", c)}>{children}</div>;
}
