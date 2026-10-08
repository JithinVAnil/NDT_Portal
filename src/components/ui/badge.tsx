import * as React from "react";
import { cn } from "@/lib/utils";

type Tone = "neutral" | "info" | "ok" | "warn" | "bad" | "navy" | "violet";

const tones: Record<Tone, string> = {
  neutral: "bg-[#eef1f5] text-[#3d4757] border-[#dde3ec]",
  info: "bg-info-bg text-info border-[#c9daf6]",
  ok: "bg-ok-bg text-ok border-[#bfe3cf]",
  warn: "bg-warn-bg text-warn border-[#f2d9a6]",
  bad: "bg-bad-bg text-bad border-[#f5c6c1]",
  navy: "bg-navy-900 text-white border-navy-900",
  violet: "bg-[#f1ecfb] text-[#5b3aa8] border-[#ddd0f5]",
};

export function Badge({
  tone = "neutral",
  className,
  children,
  dot,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-[3px] border px-1.5 py-[1px] text-[11.5px] font-medium leading-5",
        tones[tone],
        className,
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

const STATUS_TONE: Record<string, Tone> = {
  // nominations
  Draft: "neutral",
  Submitted: "info",
  "Under Review": "violet",
  Eligible: "ok",
  Ineligible: "bad",
  Approved: "ok",
  Rejected: "bad",
  Allocated: "info",
  Onboarded: "navy",
  // eligibility
  ELIGIBLE: "ok",
  REVIEW_REQUIRED: "warn",
  NOT_ELIGIBLE: "bad",
  // risk
  ON_TRACK: "ok",
  AT_RISK: "warn",
  CRITICAL: "bad",
  NOT_STARTED: "neutral",
  // completion
  "In Progress": "info",
  "Eligible for Completion": "warn",
  Completed: "ok",
  "Not Completed": "bad",
  // batches
  Planned: "neutral",
  Active: "info",
  Cancelled: "bad",
  // content QC
  Ready: "ok",
  "Pending QC": "warn",
  "Pending Assets": "neutral",
  "Needs Review": "bad",
  // generic
  Success: "ok",
  Failure: "bad",
  SUCCESS: "ok",
  FAILURE: "bad",
  Synced: "ok",
  Pending: "warn",
  Failed: "bad",
  Present: "ok",
  Absent: "bad",
  Late: "warn",
  Excused: "neutral",
  Evaluated: "ok",
  "Not Started": "neutral",
  Pass: "ok",
  Fail: "bad",
  Implemented: "ok",
  "Prototype / Mock": "warn",
};

const LABELS: Record<string, string> = {
  ELIGIBLE: "✓ Eligible",
  REVIEW_REQUIRED: "⚠ Review Required",
  NOT_ELIGIBLE: "✕ Not Eligible",
  ON_TRACK: "On Track",
  AT_RISK: "At Risk",
  CRITICAL: "Critical",
  NOT_STARTED: "Not Started",
};

export function StatusBadge({ status, className }: { status?: string | null; className?: string }) {
  if (!status) return <span className="text-subtle">—</span>;
  const tone = STATUS_TONE[status] ?? (status.startsWith("Pending") ? "warn" : "neutral");
  return (
    <Badge tone={tone} className={className} dot={tone !== "navy"}>
      {LABELS[status] ?? status}
    </Badge>
  );
}

export function RiskBadge({ level }: { level?: string | null }) {
  return <StatusBadge status={level ?? undefined} />;
}
