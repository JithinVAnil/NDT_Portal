"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { RefreshCcw, Trophy } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, KeyValue, LoadingBlock } from "@/components/ui/states";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { fmtDate, fmtDateTime, pct } from "@/lib/utils";
import type { LearnerProfile, Role } from "@/types/api";
import { CompletionCriteria, ProgressBreakdown } from "./progress-panels";

export function SimpleTable({ head, rows, empty }: { head: string[]; rows: React.ReactNode[][]; empty: string }) {
  if (!rows.length) return <EmptyState title={empty} />;
  return (
    <div className="scroll-thin overflow-x-auto">
      <table className="w-full text-left text-[13px]">
        <thead>
          <tr className="border-b border-line bg-[#f7f9fb]">
            {head.map((h) => (
              <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted first:pl-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-line/70 last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-3 py-2 align-top first:pl-4">{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function LearnerDetailPage({ role }: { role: Role }) {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const base = role === "ADMIN" ? "/admin" : "/department";
  const { data, error, loading, reload } = useApi<LearnerProfile>(`/learners/${id}`);
  const [busy, setBusy] = React.useState<string | null>(null);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={10} />;
  const l = data.learner;

  const simulate = async (enrollmentId: number) => {
    setBusy("ndu");
    try {
      const r = await api<{ old_progress: number; new_progress: number; message: string }>("/ndu/simulate-update", {
        body: { enrollment_id: enrollmentId },
      });
      toast.success("NDU update received (demo)", `Progress ${r.old_progress.toFixed(0)}% → ${r.new_progress.toFixed(0)}%`);
      reload();
    } catch (e) {
      toast.error("NDU simulation failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };
  const complete = async (enrollmentId: number) => {
    setBusy("complete");
    try {
      const r = await api<{ certificate_no: string }>(`/completion/${enrollmentId}/complete`, { method: "POST" });
      toast.success("Course completion recorded", r.certificate_no);
      reload();
    } catch (e) {
      toast.error("Cannot mark completed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title={l.full_name}
        badge={<StatusBadge status={l.status} />}
        description={`${l.learner_code} · ${l.designation ?? ""} · ${l.department}`}
        breadcrumbs={[{ label: role === "ADMIN" ? "Administrator" : "Department" }, { label: "Learners", href: `${base}/learners` }, { label: l.learner_code }]}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {data.enrollments.length === 0 && (
            <Card>
              <EmptyState title="No course enrolment yet" description="The learner will appear here once a nomination is approved and a course is allocated." />
            </Card>
          )}
          {data.enrollments.map((e) => (
            <Card key={e.id}>
              <CardHeader
                title={e.course}
                description={
                  <>
                    Batch {e.batch ?? "not assigned"} · Enrolment status <StatusBadge status={e.status} />
                    {e.current_module && <> · Current module M{e.current_module.sequence}: {e.current_module.title}</>}
                  </>
                }
                actions={
                  role === "ADMIN" && (
                    <>
                      {e.status === "Onboarded" && (
                        <Button size="sm" variant="outline" loading={busy === "ndu"} onClick={() => simulate(e.id)}>
                          <RefreshCcw /> Simulate NDU update
                        </Button>
                      )}
                      {e.completion?.status === "Eligible for Completion" && (
                        <Button size="sm" variant="success" loading={busy === "complete"} onClick={() => complete(e.id)}>
                          <Trophy /> Mark completed
                        </Button>
                      )}
                    </>
                  )
                }
              />
              <CardBody className="space-y-4">
                {e.progress ? <ProgressBreakdown p={e.progress} /> : <p className="text-[13px] text-muted">Progress tracking begins at onboarding.</p>}
                <div className="grid gap-4 lg:grid-cols-2">
                  {e.completion && <CompletionCriteria status={e.completion.status} criteria={e.completion.criteria} />}
                  {e.ndu && (
                    <div className="rounded-md border border-line p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <p className="text-[12.5px] font-semibold">NDU learning reference</p>
                        <Badge tone="warn">Prototype / Demo</Badge>
                      </div>
                      <KeyValue
                        items={[
                          ["NDU learner ref", <span key="r" className="font-mono">{e.ndu.ndu_learner_ref}</span>],
                          ["NDU course ref", <span key="c" className="font-mono">{e.ndu.ndu_course_ref}</span>],
                          ["Sync status", <StatusBadge key="s" status={e.ndu.sync_status} />],
                          ["Last synced", fmtDateTime(e.ndu.last_synced_at)],
                        ]}
                      />
                    </div>
                  )}
                </div>
              </CardBody>
            </Card>
          ))}

          <Card>
            <Tabs defaultValue="assessments">
              <div className="px-4 pt-2">
                <TabsList>
                  <TabsTrigger value="assessments">Assessments ({data.assessment_results.length})</TabsTrigger>
                  <TabsTrigger value="practicals">Practicals ({data.practical_submissions.length})</TabsTrigger>
                  <TabsTrigger value="attendance">Attendance ({data.attendance.length})</TabsTrigger>
                  <TabsTrigger value="nominations">Nominations ({data.nominations.length})</TabsTrigger>
                  <TabsTrigger value="ndu">NDU sync ({data.ndu_sync_logs.length})</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="assessments" className="pt-0">
                <SimpleTable
                  empty="No assessment records available."
                  head={["Assessment", "Type", "Score", "%", "Result", "Evaluator", "Date"]}
                  rows={data.assessment_results.map((r) => [
                    r.assessment,
                    r.assessment_type,
                    <span key="s" className="tabular">{r.score}/{r.max_score}</span>,
                    <span key="p" className="tabular">{pct(r.percentage)}</span>,
                    <StatusBadge key="r" status={r.passed ? "Pass" : "Fail"} />,
                    r.evaluator,
                    fmtDate(r.evaluated_at),
                  ])}
                />
              </TabsContent>
              <TabsContent value="practicals" className="pt-0">
                <SimpleTable
                  empty="No practical submissions yet."
                  head={["Practical", "Status", "Score", "Remarks", "Evaluated"]}
                  rows={data.practical_submissions.map((s) => [
                    s.practical,
                    <StatusBadge key="s" status={s.status} />,
                    s.score !== null ? `${s.score}/${s.max_score}` : "—",
                    s.remarks ?? "—",
                    fmtDate(s.evaluated_at),
                  ])}
                />
              </TabsContent>
              <TabsContent value="attendance" className="pt-0">
                <SimpleTable
                  empty="No attendance recorded yet."
                  head={["Date", "Session", "Status", "Remarks"]}
                  rows={data.attendance.map((a) => [fmtDate(a.date), a.title ?? `Session ${a.session_no}`, <StatusBadge key="s" status={a.status} />, a.remarks ?? "—"])}
                />
              </TabsContent>
              <TabsContent value="nominations" className="pt-0">
                <SimpleTable
                  empty="No nominations."
                  head={["Nomination", "Course", "Mode", "Status", "Created"]}
                  rows={data.nominations.map((n) => [
                    <Link key="n" href={`${base}/nominations/${n.id}`} className="font-mono text-brand-600 hover:underline">{n.nomination_no}</Link>,
                    n.course,
                    n.training_mode,
                    <StatusBadge key="s" status={n.status} />,
                    fmtDate(n.created_at),
                  ])}
                />
              </TabsContent>
              <TabsContent value="ndu" className="pt-0">
                <SimpleTable
                  empty="No NDU sync records."
                  head={["Time", "Type", "Field", "Old → New", "Result"]}
                  rows={data.ndu_sync_logs.map((s) => [
                    fmtDateTime(s.timestamp),
                    s.sync_type,
                    s.field ?? "—",
                    s.old_value || s.new_value ? `${s.old_value ?? "—"} → ${s.new_value ?? "—"}` : "—",
                    <StatusBadge key="r" status={s.result} />,
                  ])}
                />
              </TabsContent>
            </Tabs>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Learner profile" />
            <CardBody>
              <KeyValue
                cols={1}
                items={[
                  ["Learner ID", <span key="l" className="font-mono">{l.learner_code}</span>],
                  ["Employee ID", <span key="e" className="font-mono">{l.employee_id}</span>],
                  ["Email", l.email],
                  ["Mobile", l.mobile],
                  ["Designation", l.designation],
                  ["Qualification", l.qualification],
                  ["Department", l.department],
                  ["Location", l.location],
                  ["Registered", fmtDate(l.created_at)],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Recent activity" />
            <CardBody>
              {data.activity.length === 0 ? (
                <p className="text-[13px] text-muted">No activity recorded.</p>
              ) : (
                <ol className="space-y-2.5">
                  {data.activity.slice(0, 10).map((a) => (
                    <li key={a.id} className="text-[12.5px]">
                      <p className="font-medium">{a.action.replaceAll("_", " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}</p>
                      <p className="text-muted">{a.user} · {fmtDateTime(a.timestamp)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  );
}
