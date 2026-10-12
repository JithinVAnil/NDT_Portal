"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { cn } from "@/lib/utils";
import type { CalendarEvent } from "@/types/api";

const STATUS_TONE: Record<string, "ok" | "info" | "neutral" | "warn"> = {
  Active: "ok", Completed: "neutral", Planned: "info", Cancelled: "warn",
};
const MODE_LABEL: Record<string, string> = { Physical: "Classroom", Digital: "Online", Hybrid: "Hybrid" };

function monthKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function CalendarPage() {
  const [month, setMonth] = React.useState(() => {
    const n = new Date();
    return new Date(n.getFullYear(), n.getMonth(), 1);
  });
  const key = monthKey(month);
  const { data, error, loading, reload } = useApi<CalendarEvent[]>("/masters/calendar", { month: key });

  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstWeekday = (new Date(month.getFullYear(), month.getMonth(), 1).getDay() + 6) % 7; // Mon=0
  const days: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)),
  ];
  while (days.length % 7 !== 0) days.push(null);

  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const batchesOn = (d: Date) => {
    const s = iso(d);
    return (data ?? []).filter((e) => e.start_date <= s && e.end_date >= s);
  };

  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));
  const monthLabel = month.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

  return (
    <>
      <PageHeader
        title="Training Calendar"
        description="Scheduled training batches across all venues and courses."
        breadcrumbs={[{ label: "Administrator" }, { label: "Training Delivery" }, { label: "Calendar" }]}
      />
      <Card>
        <CardHeader
          title={monthLabel}
          description={`${data?.length ?? 0} batch(es) this month`}
          actions={
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={() => shift(-1)} aria-label="Previous month"><ChevronLeft /></Button>
              <Button size="sm" variant="outline" onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</Button>
              <Button size="sm" variant="outline" onClick={() => shift(1)} aria-label="Next month"><ChevronRight /></Button>
            </div>
          }
        />
        <CardBody>
          {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : (
            <>
              <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-semibold uppercase tracking-wide text-muted">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-1">{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {days.map((d, i) => {
                  const evts = d ? batchesOn(d) : [];
                  return (
                    <div key={i} className={cn(
                      "min-h-[88px] rounded-md border p-1.5 text-left align-top",
                      d ? "bg-card" : "bg-muted/30 border-transparent",
                    )}>
                      {d && (
                        <>
                          <span className="text-[11px] font-semibold text-muted tabular">{d.getDate()}</span>
                          <div className="mt-0.5 space-y-0.5">
                            {evts.slice(0, 3).map((e) => (
                              <div key={e.id} className={cn(
                                "truncate rounded px-1 py-0.5 text-[10px] font-medium text-white",
                                e.status === "Active" ? "bg-ok" : e.status === "Completed" ? "bg-[#6b7586]" : e.status === "Cancelled" ? "bg-bad" : "bg-info",
                              )} title={`${e.name} (${e.start_date} → ${e.end_date})`}>
                                {e.course_code} · {e.code.split("-").slice(-2, -1)[0] ?? e.code}
                              </div>
                            ))}
                            {evts.length > 3 && <div className="text-[10px] text-muted">+{evts.length - 3} more</div>}
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="mt-4">
                {!(data ?? []).length ? (
                  <EmptyState title="No batches this month." description="Use the arrows to browse other months." />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-[12.5px]">
                      <thead>
                        <tr className="border-b text-left text-[11px] uppercase tracking-wide text-muted">
                          <th className="py-2 pr-3">Batch</th>
                          <th className="py-2 pr-3">Course</th>
                          <th className="py-2 pr-3">Dates</th>
                          <th className="py-2 pr-3">Mode</th>
                          <th className="py-2 pr-3">Venue / Location</th>
                          <th className="py-2 pr-3">Trainer</th>
                          <th className="py-2 pr-3">Enrolled</th>
                          <th className="py-2">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(data ?? []).map((e) => (
                          <tr key={e.id} className="border-b last:border-0">
                            <td className="py-2 pr-3">
                              <p className="font-medium">{e.name}</p>
                              <p className="font-mono text-[11px] text-muted">{e.code}</p>
                            </td>
                            <td className="py-2 pr-3">{e.course}</td>
                            <td className="py-2 pr-3 tabular whitespace-nowrap">{e.start_date} → {e.end_date}</td>
                            <td className="py-2 pr-3">{MODE_LABEL[e.mode] ?? e.mode}</td>
                            <td className="py-2 pr-3">
                              {e.venue ? (
                                <div>
                                  <p>{e.venue}</p>
                                  <p className="text-[11px] text-muted">{e.venue_city}</p>
                                </div>
                              ) : e.location}
                            </td>
                            <td className="py-2 pr-3">{e.trainer ?? e.instructor}</td>
                            <td className="py-2 pr-3 tabular">{e.enrolled}/{e.capacity}</td>
                            <td className="py-2"><Badge tone={STATUS_TONE[e.status] ?? "neutral"}>{e.status}</Badge></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </CardBody>
      </Card>
    </>
  );
}
