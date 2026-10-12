"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Trophy, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { RiskBadge, StatusBadge } from "@/components/ui/badge";
import { Alert, ErrorState, LoadingBlock, ProgressBar } from "@/components/ui/states";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { pct, timeAgo } from "@/lib/utils";
import type { CompletionCriterion, Progress, Role } from "@/types/api";

interface Rules {
  risk: Record<string, number>;
  completion: Record<string, number | boolean>;
  weights: Record<string, number>;
  note: string;
}

function RulesPanel({ rules }: { rules: Rules }) {
  const r = rules.risk;
  return (
    <Card>
      <CardHeader title="Demo rules" description={rules.note} />
      <CardBody className="grid gap-4 text-[12.5px] md:grid-cols-3">
        <div>
          <p className="mb-1 font-semibold text-ok">ON TRACK</p>
          <p>Progress ≥ {r.on_track_progress}% of schedule and no risk flags.</p>
        </div>
        <div>
          <p className="mb-1 font-semibold text-warn">AT RISK — any of</p>
          <ul className="list-disc pl-4">
            <li>Progress &lt; {r.at_risk_progress}% (of expected progress to date)</li>
            <li>Attendance &lt; {r.at_risk_attendance}%</li>
            <li>Assessment average &lt; {r.at_risk_score}%</li>
            <li>No activity for {r.inactivity_days} days</li>
          </ul>
        </div>
        <div>
          <p className="mb-1 font-semibold text-bad">CRITICAL — any of</p>
          <ul className="list-disc pl-4">
            <li>Attendance &lt; {r.critical_attendance}%</li>
            <li>{r.critical_failed_assessments}+ failed assessments</li>
          </ul>
          <p className="mt-2 text-muted">
            Overall progress = modules {Math.round(rules.weights.modules * 100)}% + videos {Math.round(rules.weights.content * 100)}% + practicals{" "}
            {Math.round(rules.weights.practicals * 100)}% + assessments passed {Math.round(rules.weights.assessments * 100)}%.
          </p>
        </div>
      </CardBody>
    </Card>
  );
}

function Criteria({ items }: { items: CompletionCriterion[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((c) => (
        <span
          key={c.code}
          title={`${c.label}: ${c.detail}`}
          className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11.5px] ${c.met ? "border-[#bfe3cf] bg-ok-bg text-ok" : "border-[#f5c6c1] bg-bad-bg text-bad"}`}
        >
          {c.met ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
          {c.code.charAt(0) + c.code.slice(1).toLowerCase()} <span className="tabular opacity-80">{c.detail}</span>
        </span>
      ))}
    </div>
  );
}

interface CompletionRow {
  id: number;
  enrollment_id: number;
  learner_id: number;
  learner: string;
  learner_code: string;
  department_code: string;
  course: string;
  course_code: string;
  batch: string | null;
  status: string;
  criteria: CompletionCriterion[];
  certificate_no: string | null;
  completed_at: string | null;
}

export function ProgressPage({ role }: { role: Role }) {
  const params = useSearchParams();
  const toast = useToast();
  const base = role === "ADMIN" ? "/admin" : "/department";
  const [course, setCourse] = React.useState("");
  const [risk, setRisk] = React.useState(params.get("risk") ?? "");
  const courses = useApi<{ id: number; title: string }[]>("/courses/options");
  const prog = useApi<Progress[]>("/progress", { course_id: course, risk_level: risk });
  const atRisk = useApi<Progress[]>("/progress", { risk_level: "AT_RISK,CRITICAL" });
  const rules = useApi<Rules>("/progress/rules");
  const [compStatus, setCompStatus] = React.useState("");
  const comp = useApi<CompletionRow[]>("/completion", { status: compStatus });
  const [busy, setBusy] = React.useState<number | null>(null);

  const complete = async (r: CompletionRow) => {
    setBusy(r.enrollment_id);
    try {
      const res = await api<{ certificate_no: string }>(`/completion/${r.enrollment_id}/complete`, { method: "POST" });
      toast.success("Completion recorded", `${r.learner} · ${res.certificate_no}`);
      comp.reload();
      prog.reload();
    } catch (e) {
      toast.error("Cannot complete", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const columns: ColumnDef<Progress>[] = [
    {
      accessorKey: "learner",
      header: "Learner",
      cell: ({ row }) => (
        <Link href={`${base}/learners/${row.original.learner_id}`} className="hover:underline" onClick={(e) => e.stopPropagation()}>
          <p className="font-medium text-brand-600">{row.original.learner}</p>
          <p className="text-[11.5px] text-muted">{row.original.learner_code} · {row.original.department_code}</p>
        </Link>
      ),
    },
    { accessorKey: "course_code", header: "Course" },
    { accessorKey: "batch", header: "Batch", cell: ({ row }) => <span className="text-[12px]">{row.original.batch}</span> },
    {
      accessorKey: "overall_pct",
      header: "Progress",
      cell: ({ row }) => (
        <div className="w-32">
          <div className="flex justify-between text-[12px]">
            <span className="tabular font-semibold">{pct(row.original.overall_pct)}</span>
            {row.original.expected_pct !== null && <span className="tabular text-muted">exp {pct(row.original.expected_pct)}</span>}
          </div>
          <ProgressBar value={row.original.overall_pct} size="sm" />
        </div>
      ),
    },
    { id: "mod", header: "Modules", accessorFn: (p) => p.modules_completed, cell: ({ row }) => <span className="tabular">{row.original.modules_completed}/{row.original.modules_total}</span> },
    { id: "prac", header: "Practicals", accessorFn: (p) => p.practicals_completed, cell: ({ row }) => <span className="tabular">{row.original.practicals_completed}/{row.original.practicals_total}</span> },
    { id: "ass", header: "Assessments", accessorFn: (p) => p.assessments_passed, cell: ({ row }) => <span className="tabular">{row.original.assessments_passed}/{row.original.assessments_total}</span> },
    { accessorKey: "attendance_pct", header: "Attendance", cell: ({ row }) => <span className="tabular">{pct(row.original.attendance_pct)}</span> },
    { accessorKey: "average_score", header: "Avg score", cell: ({ row }) => <span className="tabular">{pct(row.original.average_score)}</span> },
    { accessorKey: "last_activity_at", header: "Last activity", cell: ({ row }) => <span className="text-[12px]">{timeAgo(row.original.last_activity_at)}</span> },
    {
      accessorKey: "risk_level",
      header: "Risk",
      cell: ({ row }) => (
        <div className="max-w-[260px]">
          <RiskBadge level={row.original.risk_level} />
          {(row.original.risk_level === "AT_RISK" || row.original.risk_level === "CRITICAL") && (
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{row.original.risk_reasons.join("; ")}</p>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Progress Monitoring"
        description="Learner progress, at-risk identification and completion tracking."
        breadcrumbs={[{ label: role === "ADMIN" ? "Administrator" : "Department" }, { label: "Progress" }]}
      />
      <Tabs defaultValue={params.get("risk") ? "risk" : "progress"}>
        <TabsList>
          <TabsTrigger value="progress">Progress</TabsTrigger>
          <TabsTrigger value="risk">At-risk learners ({atRisk.data?.length ?? "…"})</TabsTrigger>
          <TabsTrigger value="completion">Completion</TabsTrigger>
          <TabsTrigger value="rules">Rules</TabsTrigger>
        </TabsList>
        <TabsContent value="progress">
          <Card>
            {prog.error ? <ErrorState message={prog.error} onRetry={prog.reload} /> : prog.loading && !prog.data ? <LoadingBlock rows={8} /> : (
              <DataTable
                columns={columns}
                data={prog.data ?? []}
                searchPlaceholder="Search learner…"
                emptyTitle="No progress records."
                caption="Learner progress"
                toolbar={
                  <>
                    <Select value={course} onChange={(e) => setCourse(e.target.value)} className="w-52" aria-label="Course">
                      <option value="">All courses</option>
                      {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                    </Select>
                    <Select value={risk} onChange={(e) => setRisk(e.target.value)} className="w-48" aria-label="Risk">
                      <option value="">All risk levels</option>
                      <option value="ON_TRACK">On track</option>
                      <option value="AT_RISK,CRITICAL">At risk + critical</option>
                      <option value="AT_RISK">At risk</option>
                      <option value="CRITICAL">Critical</option>
                      <option value="NOT_STARTED">Not started</option>
                    </Select>
                  </>
                }
              />
            )}
          </Card>
        </TabsContent>
        <TabsContent value="risk">
          {atRisk.loading && !atRisk.data ? <LoadingBlock /> : (atRisk.data ?? []).length === 0 ? (
            <Alert tone="ok">No learners are currently at risk.</Alert>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {(atRisk.data ?? []).map((p) => (
                <Card key={p.id} className={p.risk_level === "CRITICAL" ? "border-[#f5c6c1]" : "border-[#f2d9a6]"}>
                  <CardBody className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <Link href={`${base}/learners/${p.learner_id}`} className="hover:underline">
                        <p className="font-semibold text-navy-900">{p.learner}</p>
                        <p className="text-[12px] text-muted">{p.learner_code} · {p.department_code} · {p.batch}</p>
                      </Link>
                      <RiskBadge level={p.risk_level} />
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-[12px]">
                      <div><p className="text-muted">Progress</p><p className="tabular font-semibold">{pct(p.overall_pct)}</p></div>
                      <div><p className="text-muted">Attendance</p><p className="tabular font-semibold">{pct(p.attendance_pct)}</p></div>
                      <div><p className="text-muted">Avg score</p><p className="tabular font-semibold">{pct(p.average_score)}</p></div>
                    </div>
                    <ul className="list-disc pl-4 text-[12.5px] text-ink/85">
                      {p.risk_reasons.map((r) => <li key={r}>{r}</li>)}
                    </ul>
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
        <TabsContent value="completion">
          <Alert tone="info" className="mb-3">
            Demo completion criteria: required modules complete · assessments passed · practicals completed · attendance requirement met. Final criteria to be configured per official programme rules.
          </Alert>
          <Card>
            {comp.loading && !comp.data ? <LoadingBlock /> : (
              <DataTable
                data={comp.data ?? []}
                searchPlaceholder="Search learner…"
                emptyTitle="No completion records."
                toolbar={
                  <Select value={compStatus} onChange={(e) => setCompStatus(e.target.value)} className="w-56" aria-label="Completion status">
                    <option value="">All statuses</option>
                    {["In Progress", "Eligible for Completion", "Completed", "Not Completed"].map((s) => <option key={s}>{s}</option>)}
                  </Select>
                }
                columns={[
                  { accessorKey: "learner", header: "Learner", cell: ({ row }) => <div><p className="font-medium">{row.original.learner}</p><p className="text-[11.5px] text-muted">{row.original.learner_code} · {row.original.department_code}</p></div> },
                  { accessorKey: "course_code", header: "Course" },
                  { accessorKey: "batch", header: "Batch", cell: ({ row }) => <span className="text-[12px]">{row.original.batch}</span> },
                  { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
                  { id: "crit", header: "Criteria", cell: ({ row }) => <Criteria items={row.original.criteria} /> },
                  { accessorKey: "certificate_no", header: "Reference", cell: ({ row }) => <span className="font-mono text-[11.5px]">{row.original.certificate_no ?? "—"}</span> },
                  ...(role === "ADMIN"
                    ? [{
                        id: "act",
                        header: "",
                        cell: ({ row }: { row: { original: CompletionRow } }) =>
                          row.original.status === "Eligible for Completion" ? (
                            <Button size="xs" variant="success" loading={busy === row.original.enrollment_id} onClick={() => complete(row.original)}>
                              <Trophy /> Mark completed
                            </Button>
                          ) : null,
                      } as ColumnDef<CompletionRow>]
                    : []),
                ]}
              />
            )}
          </Card>
        </TabsContent>
        <TabsContent value="rules">{rules.data && <RulesPanel rules={rules.data} />}</TabsContent>
      </Tabs>
    </>
  );
}
