"use client";

import * as React from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { ProgressBar } from "@/components/ui/states";
import { RiskBadge, StatusBadge } from "@/components/ui/badge";
import { cn, fmtDateTime, pct, timeAgo } from "@/lib/utils";
import type { CompletionCriterion, Progress } from "@/types/api";

export function RiskReasons({ level, reasons }: { level?: string | null; reasons?: string[] }) {
  if (!level) return null;
  const tone =
    level === "CRITICAL" ? "border-[#f5c6c1] bg-bad-bg" : level === "AT_RISK" ? "border-[#f2d9a6] bg-warn-bg" : "border-line bg-canvas";
  return (
    <div className={cn("rounded-md border px-3 py-2", tone)}>
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-semibold text-ink">Risk status</span>
        <RiskBadge level={level} />
      </div>
      {reasons && reasons.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-[12.5px] text-ink/80">
          {reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function ProgressBreakdown({ p, compact = false }: { p: Progress; compact?: boolean }) {
  const rows: [string, number, number, string][] = [
    ["Modules", p.modules_completed, p.modules_total, "NDU"],
    ["Videos / content", p.content_completed, p.content_total, "NDU"],
    ["Practicals", p.practicals_completed, p.practicals_total, "Portal"],
    ["Assessments passed", p.assessments_passed, p.assessments_total, "Portal"],
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Overall progress</p>
          <p className="tabular text-[34px] font-semibold leading-none text-navy-900">{pct(p.overall_pct)}</p>
          {p.expected_pct !== null && (
            <p className="mt-1 text-[12px] text-muted">
              {pct(p.expected_pct)} expected by now · {pct(p.schedule_pct)} of schedule
            </p>
          )}
        </div>
        <div className="min-w-[200px] flex-1">
          <ProgressBar value={p.overall_pct} label="Overall progress" />
          {p.expected_pct !== null && (
            <div className="relative mt-1 h-3" aria-hidden>
              <div className="absolute top-0 h-3 border-l-2 border-dashed border-navy-700" style={{ left: `${Math.min(100, p.expected_pct)}%` }} />
              <span className="absolute -top-0.5 ml-1 text-[10.5px] text-muted" style={{ left: `${Math.min(92, p.expected_pct)}%` }}>
                expected
              </span>
            </div>
          )}
        </div>
      </div>
      <div className={cn("grid gap-3", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-4")}>
        {rows.map(([label, done, total, src]) => (
          <div key={label} className="rounded-md border border-line px-3 py-2.5">
            <div className="flex items-center justify-between text-[12px]">
              <span className="text-muted">{label}</span>
              <span className="text-[10.5px] uppercase text-subtle">{src}</span>
            </div>
            <p className="tabular mt-0.5 text-[17px] font-semibold">
              {done}/{total}
            </p>
            <ProgressBar value={total ? (100 * done) / total : 0} size="sm" className="mt-1.5" label={label} />
          </div>
        ))}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-[12.5px] sm:grid-cols-4">
        <div>
          <dt className="text-muted">Attendance</dt>
          <dd className="tabular font-semibold">
            {pct(p.attendance_pct, 1)} <span className="font-normal text-muted">({p.sessions_attended}/{p.sessions_marked} sessions)</span>
          </dd>
        </div>
        <div>
          <dt className="text-muted">Average score</dt>
          <dd className="tabular font-semibold">{pct(p.average_score, 1)}</dd>
        </div>
        <div>
          <dt className="text-muted">Failed assessments</dt>
          <dd className="tabular font-semibold">{p.assessments_failed}</dd>
        </div>
        <div>
          <dt className="text-muted">Last activity</dt>
          <dd className="font-semibold" title={fmtDateTime(p.last_activity_at)}>
            {timeAgo(p.last_activity_at)}
          </dd>
        </div>
      </dl>
      <RiskReasons level={p.risk_level} reasons={p.risk_reasons} />
    </div>
  );
}

export function CompletionCriteria({ status, criteria }: { status: string; criteria: CompletionCriterion[] }) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <StatusBadge status={status} />
        <span className="text-[11.5px] text-muted">Prototype / demo completion rules</span>
      </div>
      <ul className="divide-y divide-line rounded-md border border-line">
        {criteria.map((c) => (
          <li key={c.code} className="flex items-center gap-3 px-3 py-2">
            {c.met ? <CheckCircle2 className="h-4 w-4 text-ok" aria-label="Met" /> : <XCircle className="h-4 w-4 text-bad" aria-label="Not met" />}
            <span className="flex-1 text-[13px]">{c.label}</span>
            <span className="tabular text-[12.5px] text-muted">{c.detail}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
