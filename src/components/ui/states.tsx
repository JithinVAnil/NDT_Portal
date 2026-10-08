import * as React from "react";
import { AlertTriangle, Inbox, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded", className)} aria-hidden />;
}

export function LoadingBlock({ rows = 5, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div className="space-y-2.5 p-4" role="status" aria-label={label}>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={cn("h-8", i === 0 && "h-9 w-1/3")} />
      ))}
      <span className="sr-only">{label}…</span>
    </div>
  );
}

export function KpiSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[92px] rounded-lg" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-canvas text-subtle">
        {icon ?? <Inbox className="h-5 w-5" />}
      </div>
      <p className="font-medium text-ink">{title}</p>
      {description && <p className="mt-1 max-w-md text-[12.5px] text-muted">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="m-4 flex items-start gap-3 rounded-md border border-[#f5c6c1] bg-bad-bg px-4 py-3 text-[13px] text-bad" role="alert">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex-1">
        <p className="font-medium">Unable to load data</p>
        <p className="text-[12.5px]">{message}</p>
      </div>
      {onRetry && (
        <Button size="xs" variant="outline" onClick={onRetry}>
          <RefreshCw /> Retry
        </Button>
      )}
    </div>
  );
}

export function Alert({
  tone = "info",
  title,
  children,
  className,
  icon,
}: {
  tone?: "info" | "warn" | "bad" | "ok";
  title?: string;
  children?: React.ReactNode;
  className?: string;
  icon?: React.ReactNode;
}) {
  const t = {
    info: "border-[#c9daf6] bg-info-bg text-[#17468f]",
    warn: "border-[#f2d9a6] bg-warn-bg text-[#7a4700]",
    bad: "border-[#f5c6c1] bg-bad-bg text-bad",
    ok: "border-[#bfe3cf] bg-ok-bg text-ok",
  }[tone];
  return (
    <div className={cn("flex gap-2.5 rounded-md border px-3.5 py-2.5 text-[12.5px]", t, className)} role={tone === "bad" ? "alert" : "note"}>
      {icon && <span className="mt-0.5 shrink-0 [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children}
      </div>
    </div>
  );
}

export function ProgressBar({
  value,
  className,
  tone,
  label,
  size = "md",
}: {
  value: number | null | undefined;
  className?: string;
  tone?: "brand" | "ok" | "warn" | "bad";
  label?: string;
  size?: "sm" | "md";
}) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  const t = tone ?? (v >= 70 ? "ok" : v >= 50 ? "brand" : v >= 30 ? "warn" : "bad");
  const color = { brand: "bg-brand-600", ok: "bg-ok", warn: "bg-saffron", bad: "bg-bad" }[t];
  return (
    <div
      className={cn("w-full overflow-hidden rounded-full bg-[#e6eaf0]", size === "sm" ? "h-1.5" : "h-2", className)}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label ?? "Progress"}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11.5px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="tabular mt-0.5 text-[15px] font-semibold text-ink">{value}</dd>
      {hint && <dd className="text-[12px] text-muted">{hint}</dd>}
    </div>
  );
}

export function KeyValue({ items, cols = 2 }: { items: [string, React.ReactNode][]; cols?: 1 | 2 | 3 | 4 }) {
  const c = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];
  return (
    <dl className={cn("grid grid-cols-1 gap-x-6 gap-y-3", c)}>
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11.5px] font-medium uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-[13px] text-ink">{v ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}
