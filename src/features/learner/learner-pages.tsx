"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  ClipboardCheck,
  CloudCog,
  FlaskConical,
  GraduationCap,
  Layers,
  PlayCircle,
  Target,
  Trophy,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard, KpiGrid } from "@/components/kpi";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert, EmptyState, ErrorState, KeyValue, LoadingBlock, ProgressBar } from "@/components/ui/states";
import { cn, fmtDate, fmtDateTime, pct, timeAgo } from "@/lib/utils";
import type { ContentItem, CourseTree, EnrollmentBundle, LearnerProfile } from "@/types/api";
import { CompletionCriteria, ProgressBreakdown, RiskReasons } from "../learners/progress-panels";
import { SimpleTable } from "../learners/learner-detail";
import { CourseTreeView, HierarchyStrip } from "../courses/course-tree";
import { NduVideoPlayer } from "../content/ndu-video-player";

function useMe() {
  return useApi<LearnerProfile>("/learner/me");
}

function primary(me: LearnerProfile): EnrollmentBundle | undefined {
  return me.enrollments.find((e) => e.id === me.primary_enrollment_id) ?? me.enrollments[0];
}

function Header({ title, description }: { title: string; description?: string }) {
  return <PageHeader title={title} description={description} breadcrumbs={[{ label: "Learner" }, { label: title }]} />;
}

function Gate({ children }: { children: (me: LearnerProfile, e: EnrollmentBundle | undefined) => React.ReactNode }) {
  const { data, error, loading, reload } = useMe();
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={8} />;
  return <>{children(data, primary(data))}</>;
}

function NoEnrolment() {
  return (
    <Card>
      <EmptyState
        icon={<GraduationCap className="h-5 w-5" />}
        title="You are not yet enrolled in a course"
        description="Your department has nominated you; course and batch allocation by NIELIT will appear here."
      />
    </Card>
  );
}

/* ---------------- Dashboard ---------------- */
export function LearnerDashboard() {
  return (
    <Gate>
      {(me, e) => {
        const p = e?.progress;
        const l = me.learner;
        const practicalsDone = me.practical_submissions.filter((s) => s.completed).length;
        return (
          <>
            <PageHeader
              title={`Welcome, ${l.full_name.split(" ")[0]}`}
              description={`${l.full_name} · Learner ID ${l.learner_code} · ${l.designation ?? ""} · ${l.department}`}
              breadcrumbs={[{ label: "Learner" }, { label: "Dashboard" }]}
            />
            {!e ? (
              <NoEnrolment />
            ) : (
              <div className="space-y-4">
                <Card className="overflow-hidden">
                  <div className="grid gap-0 lg:grid-cols-[1.4fr_1fr]">
                    <div className="space-y-3 p-5">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone="navy">{e.course_code}</Badge>
                        <StatusBadge status={e.status} />
                        {e.completion && <StatusBadge status={e.completion.status} />}
                      </div>
                      <h2 className="text-[19px] font-semibold text-navy-900">{e.course}</h2>
                      <p className="text-[13px] text-muted">
                        Batch <b className="text-ink">{e.batch ?? "—"}</b>
                        {e.batch_detail && <> · {e.batch_detail.mode} · {fmtDate(e.batch_detail.start_date)} – {fmtDate(e.batch_detail.end_date)}</>}
                      </p>
                      {e.current_module && (
                        <p className="text-[13px]">
                          Current module: <b>M{e.current_module.sequence} · {e.current_module.title}</b>
                        </p>
                      )}
                      {p && (
                        <div>
                          <div className="mb-1 flex justify-between text-[12.5px]">
                            <span className="text-muted">Overall progress</span>
                            <span className="tabular font-semibold">{pct(p.overall_pct)}</span>
                          </div>
                          <ProgressBar value={p.overall_pct} label="Overall progress" />
                        </div>
                      )}
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link href="/learner/course" className="rounded-md bg-navy-900 px-3 py-1.5 text-[12.5px] font-medium text-white hover:bg-navy-800">Open my course</Link>
                        <Link href="/learner/content" className="rounded-md border border-line px-3 py-1.5 text-[12.5px] font-medium hover:bg-canvas">Instructional content</Link>
                      </div>
                    </div>
                    <div className="border-t border-line bg-[#f7f9fb] p-5 lg:border-l lg:border-t-0">
                      <p className="flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted"><CalendarClock className="h-4 w-4" /> Upcoming session</p>
                      {e.next_session ? (
                        <div className="mt-2">
                          <p className="text-[15px] font-semibold">{fmtDate(e.next_session.date)} · {e.next_session.start_time}–{e.next_session.end_time}</p>
                          <p className="text-[13px] text-muted">{e.next_session.title}</p>
                          <p className="text-[12.5px] text-muted">{e.next_session.mode} · {e.next_session.location}</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-[13px] text-muted">No upcoming session scheduled.</p>
                      )}
                      <p className="mt-4 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-muted"><CloudCog className="h-4 w-4" /> NDU learning reference</p>
                      {e.ndu ? (
                        <div className="mt-2 text-[12.5px]">
                          <p className="font-mono text-[13px] font-semibold">{e.ndu.ndu_learner_ref}</p>
                          <p className="text-muted">Course {e.ndu.ndu_course_ref}</p>
                          <p className="mt-1 flex items-center gap-2">
                            <StatusBadge status={e.ndu.sync_status} /> <span className="text-muted">last sync {timeAgo(e.ndu.last_synced_at)}</span>
                          </p>
                          <p className="mt-1 text-[11.5px] text-muted">Learning is delivered on NIELIT Digital University (Prototype / Demo NDU Integration).</p>
                        </div>
                      ) : (
                        <p className="mt-2 text-[13px] text-muted">Created at onboarding.</p>
                      )}
                    </div>
                  </div>
                </Card>

                {p && (
                  <KpiGrid cols={6}>
                    <KpiCard label="Progress" value={pct(p.overall_pct)} sub={p.expected_pct !== null ? `${pct(p.expected_pct)} expected` : undefined} icon={Activity} href="/learner/progress" />
                    <KpiCard label="Modules" value={`${p.modules_completed}/${p.modules_total}`} icon={BookOpen} href="/learner/modules" />
                    <KpiCard label="Attendance" value={pct(p.attendance_pct)} sub={`${p.sessions_attended}/${p.sessions_marked} sessions`} icon={CalendarCheck} tone={p.attendance_pct !== null && p.attendance_pct < 75 ? "warn" : "default"} href="/learner/attendance" />
                    <KpiCard label="Assessments" value={`${p.assessments_passed}/${p.assessments_total}`} sub={`avg ${pct(p.average_score)}`} icon={ClipboardCheck} href="/learner/assessments" />
                    <KpiCard label="Practicals" value={`${practicalsDone}/${p.practicals_total}`} icon={FlaskConical} href="/learner/practicals" />
                    <KpiCard label="Completion" value={<span className="text-[16px]">{e.completion?.status ?? "—"}</span>} icon={Trophy} href="/learner/completion" />
                  </KpiGrid>
                )}
                {p && (p.risk_level === "AT_RISK" || p.risk_level === "CRITICAL") && (
                  <RiskReasons level={p.risk_level} reasons={p.risk_reasons} />
                )}

                <div className="grid gap-4 xl:grid-cols-2">
                  <Card>
                    <CardHeader title="Recent assessment scores" actions={<Link href="/learner/assessments" className="text-[12.5px] text-brand-600 hover:underline">All</Link>} />
                    <SimpleTable
                      empty="No assessment records available."
                      head={["Assessment", "Score", "Result", "Date"]}
                      rows={me.assessment_results.slice(0, 5).map((r) => [
                        r.assessment,
                        <span key="s" className="tabular">{r.score}/{r.max_score} ({pct(r.percentage)})</span>,
                        <StatusBadge key="r" status={r.passed ? "Pass" : "Fail"} />,
                        fmtDate(r.evaluated_at),
                      ])}
                    />
                  </Card>
                  <Card>
                    <CardHeader title="Recent activity" />
                    <CardBody>
                      <ol className="space-y-2.5">
                        {[
                          ...me.ndu_sync_logs.slice(0, 3).map((s) => ({ t: s.timestamp, text: `NDU ${s.sync_type.toLowerCase()}${s.new_value ? `: ${s.old_value ?? ""} → ${s.new_value}` : ""}` })),
                          ...me.assessment_results.slice(0, 3).map((r) => ({ t: r.evaluated_at, text: `Assessment “${r.assessment}” scored ${pct(r.percentage)}` })),
                          ...me.attendance.slice(0, 3).map((a) => ({ t: a.date + "T12:00:00Z", text: `Attendance ${a.date}: ${a.status}` })),
                        ]
                          .sort((a, b) => (a.t < b.t ? 1 : -1))
                          .slice(0, 7)
                          .map((x, i) => (
                            <li key={i} className="flex gap-3 text-[12.5px]">
                              <span className="w-24 shrink-0 text-muted">{timeAgo(x.t)}</span>
                              <span>{x.text}</span>
                            </li>
                          ))}
                      </ol>
                    </CardBody>
                  </Card>
                </div>
              </div>
            )}
          </>
        );
      }}
    </Gate>
  );
}

/* ---------------- My Course / My Modules ---------------- */
function useCourse() {
  return useApi<CourseTree>("/learner/course");
}

export function MyCoursePage({ modulesOnly = false }: { modulesOnly?: boolean }) {
  const { data, error, loading, reload } = useCourse();
  if (error) return error.includes("not found") ? <><Header title={modulesOnly ? "My Modules" : "My Course"} /><NoEnrolment /></> : <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={8} />;
  const c = data.course;
  return (
    <>
      <Header title={modulesOnly ? "My Modules" : "My Course"} description={modulesOnly ? `${c.title} — module status reported from NDU` : c.description ?? undefined} />
      {!modulesOnly && (
        <div className="mb-4 grid gap-4 xl:grid-cols-[1fr_340px]">
          <Card>
            <CardHeader title={c.title} actions={<Badge tone="navy">{c.code}</Badge>} />
            <CardBody className="space-y-3">
              <HierarchyStrip />
              <KeyValue
                cols={3}
                items={[
                  ["Batch", data.batch?.code ?? "—"],
                  ["Mode", data.batch?.mode],
                  ["Schedule", data.batch ? `${fmtDate(data.batch.start_date)} – ${fmtDate(data.batch.end_date)}` : "—"],
                  ["Instructor", data.batch?.instructor],
                  ["Pass mark", `${c.pass_percentage}%`],
                  ["Minimum attendance", `${c.min_attendance}%`],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Course composition" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
                {(["modules", "lessons", "videos", "resources", "practicals", "exercises", "assessments", "rubrics"] as const).map((k) => (
                  <div key={k}><dt className="capitalize text-muted">{k}</dt><dd className="tabular text-[17px] font-semibold">{data.counts[k]}</dd></div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      )}
      {modulesOnly && data.progress && (
        <Card className="mb-4">
          <CardBody className="space-y-3">
            <div className="flex justify-between text-[13px]">
              <span>Modules completed</span>
              <span className="tabular font-semibold">{data.progress.modules_completed}/{data.progress.modules_total}</span>
            </div>
            <ProgressBar value={(100 * data.progress.modules_completed) / (data.progress.modules_total || 1)} label="Modules completed" />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
              {data.modules.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "rounded-md border px-2 py-2 text-center text-[11.5px]",
                    m.status === "Completed" ? "border-[#bfe3cf] bg-ok-bg text-ok" : m.status === "In Progress" ? "border-brand-500 bg-brand-50 text-brand-600" : "border-line text-muted",
                  )}
                  title={m.title}
                >
                  <p className="font-semibold">M{m.sequence}</p>
                  <p className="truncate">{m.status}</p>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="Course structure" description="Module → lesson → video → resource → practical → exercise → assessment → rubric, with your status." />
        <CourseTreeView tree={data} showLearner contentHref={() => "/learner/content"} />
      </Card>
    </>
  );
}

/* ---------------- My Content ---------------- */
export function MyContentPage() {
  const { data, error, loading, reload } = useApi<ContentItem[]>("/learner/content");
  const [sel, setSel] = React.useState<number | null>(null);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={8} />;
  const videos = data.filter((c) => c.content_type === "Video");
  const resources = data.filter((c) => c.content_type !== "Video");
  const current = videos.find((v) => v.id === sel) ?? videos[0];
  return (
    <>
      <Header title="My Content" description="Instructional videos and resources for your course. Learning is completed on NDU; this portal shows the content records." />
      {data.length === 0 ? <NoEnrolment /> : (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card>
            {current ? (
              <CardBody className="space-y-3">
                <NduVideoPlayer item={current} />
                <div>
                  <h2 className="text-[16px] font-semibold text-navy-900">{current.title}</h2>
                  <p className="text-[12.5px] text-muted">{current.module ? `M${current.module_sequence}: ${current.module}` : ""}{current.lesson ? ` › ${current.lesson}` : ""} · {current.duration_minutes} min · {current.instructor}</p>
                </div>
                <p className="text-[13px]">{current.description}</p>
                {current.learning_objective && (
                  <p className="rounded-md bg-canvas px-3 py-2 text-[12.5px]"><b>Learning objective: </b>{current.learning_objective}</p>
                )}
                <div className="flex flex-wrap gap-2 text-[12px]">
                  <Badge tone={current.qc.qc_srt ? "ok" : "neutral"}>SRT captions {current.qc.qc_srt ? "✓" : "pending"}</Badge>
                  <Badge tone={current.qc.qc_vtt ? "ok" : "neutral"}>VTT {current.qc.qc_vtt ? "✓" : "pending"}</Badge>
                  <Badge tone={current.qc.qc_docx ? "ok" : "neutral"}>DOCX transcript {current.qc.qc_docx ? "✓" : "pending"}</Badge>
                  <Badge tone={current.qc.qc_pdf ? "ok" : "neutral"}>Accessible PDF {current.qc.qc_pdf ? "✓" : "pending"}</Badge>
                </div>
                {current.ai_disclosure_text && <p className="text-[11.5px] text-muted">AI disclosure: {current.ai_disclosure_text}</p>}
              </CardBody>
            ) : (
              <EmptyState title="No video records for this course yet." />
            )}
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title={`Videos (${videos.length})`} />
              <ul className="divide-y divide-line">
                {videos.map((v) => (
                  <li key={v.id}>
                    <button onClick={() => setSel(v.id)} className={cn("flex w-full items-start gap-3 px-4 py-2.5 text-left hover:bg-canvas", current?.id === v.id && "bg-brand-50")}>
                      <PlayCircle className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium">{v.title}</span>
                        <span className="block text-[12px] text-muted">{v.duration_minutes} min · M{v.module_sequence}</span>
                      </span>
                      {!v.has_video && <Badge tone="neutral">Asset pending</Badge>}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title={`Resources (${resources.length})`} />
              <ul className="divide-y divide-line">
                {resources.map((r) => (
                  <li key={r.id} className="px-4 py-2.5">
                    <p className="text-[13px] font-medium">{r.title}</p>
                    <p className="text-[12px] text-muted">{r.description}</p>
                  </li>
                ))}
                {resources.length === 0 && <li className="px-4 py-3 text-[13px] text-muted">No resources.</li>}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------------- My Practicals ---------------- */
export function MyPracticalsPage() {
  const { data, error, loading, reload } = useCourse();
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={8} />;
  const practicals = [...data.modules.flatMap((m) => m.practicals.map((p) => ({ ...p, mod: `M${m.sequence}: ${m.title}` }))), ...data.course_practicals.map((p) => ({ ...p, mod: "Course-level" }))];
  return (
    <>
      <Header title="My Practicals" description="Scenario-based practicals evaluated against rubrics." />
      <div className="grid gap-4 lg:grid-cols-2">
        {practicals.map((p) => (
          <Card key={p.id}>
            <CardHeader
              title={p.title}
              icon={<FlaskConical className="h-4 w-4 text-muted" />}
              description={`${p.code} · ${p.mod} · ~${p.estimated_minutes} min`}
              actions={<StatusBadge status={p.submission?.status ?? "Not Started"} />}
            />
            <CardBody className="space-y-2 text-[13px]">
              <p><b>Scenario: </b>{p.scenario}</p>
              <p><b>Objective: </b>{p.objective}</p>
              <ol className="list-decimal pl-5 text-[12.5px] text-ink/85">{p.instructions.map((s) => <li key={s}>{s}</li>)}</ol>
              <div className="flex flex-wrap items-center gap-3 border-t border-line pt-2 text-[12.5px]">
                <span>Score: <b className="tabular">{p.submission?.score ?? "—"}{p.submission?.score !== null && p.submission ? ` / ${p.max_score}` : ""}</b></span>
                <span>Completion: <b>{p.submission?.completed ? "Complete" : "Open"}</b></span>
                {p.submission?.remarks && <span className="text-muted">Remarks: {p.submission.remarks}</span>}
              </div>
              {p.rubric && <p className="text-[11.5px] text-muted">Rubric: {p.rubric.criteria.map((c) => `${c.name} ${c.max_score}`).join(" · ")}</p>}
            </CardBody>
          </Card>
        ))}
      </div>
    </>
  );
}

/* ---------------- My Assessments ---------------- */
export function MyAssessmentsPage() {
  const { data, error, loading, reload } = useCourse();
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={8} />;
  const all = [...data.modules.flatMap((m) => m.assessments.map((a) => ({ ...a, mod: `M${m.sequence}: ${m.title}` }))), ...data.course_assessments.map((a) => ({ ...a, mod: "Course-level" }))];
  return (
    <>
      <Header title="My Assessments" description="Your scores are recorded by NIELIT evaluators and cannot be modified by learners." />
      <Card>
        <SimpleTable
          empty="No assessments defined."
          head={["Assessment", "Type", "Module", "Max", "Score", "%", "Result", "Remarks"]}
          rows={all.map((a) => [
            <span key="t" className="font-medium">{a.title}</span>,
            a.type,
            <span key="m" className="text-[12px] text-muted">{a.mod}</span>,
            a.max_score,
            a.result ? <span key="s" className="tabular">{a.result.score}</span> : "—",
            a.result ? <span key="p" className="tabular font-semibold">{pct(a.result.percentage)}</span> : "—",
            a.result ? <StatusBadge key="r" status={a.result.passed ? "Pass" : "Fail"} /> : <StatusBadge key="r" status="Pending" />,
            <span key="re" className="text-[12px] text-muted">{a.result?.remarks ?? "—"}</span>,
          ])}
        />
      </Card>
    </>
  );
}

/* ---------------- My Progress ---------------- */
export function MyProgressPage() {
  return (
    <Gate>
      {(me, e) => (
        <>
          <Header title="My Progress" description="Module and video progress are reported by NDU; practicals, assessments and attendance are recorded in this portal." />
          {!e?.progress ? <NoEnrolment /> : (
            <Card>
              <CardHeader title={e.course} description={`Batch ${e.batch ?? "—"} · updated ${fmtDateTime(e.progress.updated_at)} · last source ${e.progress.last_source}`} />
              <CardBody>
                <ProgressBreakdown p={e.progress} />
              </CardBody>
            </Card>
          )}
          {me.ndu_sync_logs.length > 0 && (
            <Card className="mt-4">
              <CardHeader title="NDU synchronisation" description="Prototype / Demo NDU Integration" />
              <SimpleTable
                empty="No sync records."
                head={["Time", "Type", "Change", "Result"]}
                rows={me.ndu_sync_logs.map((s) => [fmtDateTime(s.timestamp), s.sync_type, s.old_value || s.new_value ? `${s.old_value ?? "—"} → ${s.new_value ?? "—"}` : "—", <StatusBadge key="r" status={s.result} />])}
              />
            </Card>
          )}
        </>
      )}
    </Gate>
  );
}

/* ---------------- My Attendance ---------------- */
export function MyAttendancePage() {
  return (
    <Gate>
      {(me, e) => {
        const counts = me.attendance.reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
        return (
          <>
            <Header title="My Attendance" description="Recorded by NIELIT for each training session. Minimum attendance requirement: 75% (demo rule)." />
            <KpiGrid cols={5}>
              <KpiCard label="Attendance rate" value={pct(e?.progress?.attendance_pct, 1)} icon={CalendarCheck} tone={e?.progress?.attendance_pct !== null && (e?.progress?.attendance_pct ?? 100) < 75 ? "warn" : "ok"} />
              <KpiCard label="Present" value={counts.Present ?? 0} />
              <KpiCard label="Late" value={counts.Late ?? 0} />
              <KpiCard label="Absent" value={counts.Absent ?? 0} tone={counts.Absent ? "bad" : "default"} />
              <KpiCard label="Excused" value={counts.Excused ?? 0} />
            </KpiGrid>
            {e?.progress?.attendance_pct !== null && (e?.progress?.attendance_pct ?? 100) < 75 && (
              <Alert tone="warn" className="mt-4">Your attendance is below the 75% requirement. Please contact your batch coordinator.</Alert>
            )}
            <Card className="mt-4">
              <SimpleTable
                empty="No attendance recorded yet."
                head={["Date", "Session", "Status"]}
                rows={me.attendance.map((a) => [fmtDate(a.date), a.title ?? `Session ${a.session_no}`, <StatusBadge key="s" status={a.status} />])}
              />
            </Card>
          </>
        );
      }}
    </Gate>
  );
}

/* ---------------- My Completion ---------------- */
export function MyCompletionPage() {
  return (
    <Gate>
      {(me, e) => (
        <>
          <Header title="My Completion" description="Completion is determined by prototype / demo rules." />
          {!e?.completion ? <NoEnrolment /> : (
            <div className="grid gap-4 xl:grid-cols-[1fr_360px]">
              <Card>
                <CardHeader title={e.course} />
                <CardBody>
                  <CompletionCriteria status={e.completion.status} criteria={e.completion.criteria} />
                  <p className="mt-3 text-[12px] text-muted">Last evaluated {fmtDateTime(e.completion.evaluated_at)}</p>
                </CardBody>
              </Card>
              <Card>
                <CardBody className="text-center">
                  <Trophy className={cn("mx-auto h-10 w-10", e.completion.status === "Completed" ? "text-saffron" : "text-subtle")} />
                  <p className="mt-2 text-[15px] font-semibold">{e.completion.status}</p>
                  {e.completion.certificate_no ? (
                    <>
                      <p className="mt-1 font-mono text-[12.5px]">{e.completion.certificate_no}</p>
                      <p className="text-[12px] text-muted">Completed {fmtDate(e.completion.completed_at)} · demo reference</p>
                    </>
                  ) : (
                    <p className="mt-1 text-[12.5px] text-muted">Meet all criteria to become eligible for completion.</p>
                  )}
                </CardBody>
              </Card>
            </div>
          )}
          {me.enrollments.length > 1 && (
            <Card className="mt-4">
              <CardHeader title="All enrolments" />
              <SimpleTable empty="—" head={["Course", "Batch", "Status", "Completion"]} rows={me.enrollments.map((x) => [x.course, x.batch ?? "—", <StatusBadge key="s" status={x.status} />, <StatusBadge key="c" status={x.completion?.status} />])} />
            </Card>
          )}
        </>
      )}
    </Gate>
  );
}

/* ---------------- Profile ---------------- */
export function MyProfilePage() {
  return (
    <Gate>
      {(me, e) => (
        <>
          <Header title="Profile" description="Your learner record. Contact your Department In-Charge to correct any details." />
          <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Card>
              <CardHeader title="Learner details" icon={<Target className="h-4 w-4 text-muted" />} />
              <CardBody>
                <KeyValue
                  cols={2}
                  items={[
                    ["Name", me.learner.full_name],
                    ["Learner ID", <span key="l" className="font-mono">{me.learner.learner_code}</span>],
                    ["Employee ID", <span key="e" className="font-mono">{me.learner.employee_id}</span>],
                    ["Email", me.learner.email],
                    ["Mobile", me.learner.mobile],
                    ["Designation", me.learner.designation],
                    ["Qualification", me.learner.qualification],
                    ["Department", me.learner.department],
                    ["Location", me.learner.location],
                    ["Status", <StatusBadge key="s" status={me.learner.status} />],
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Programme" icon={<Layers className="h-4 w-4 text-muted" />} />
              <CardBody>
                <KeyValue
                  cols={1}
                  items={[
                    ["Course", e?.course ?? "—"],
                    ["Batch", e?.batch ?? "—"],
                    ["Onboarded", fmtDateTime(e?.onboarded_at)],
                    ["NDU learner reference", e?.ndu ? <span key="n" className="font-mono">{e.ndu.ndu_learner_ref} (demo)</span> : "—"],
                    ["Nominations", me.nominations.map((n) => `${n.nomination_no} (${n.status})`).join(", ") || "—"],
                  ]}
                />
              </CardBody>
            </Card>
          </div>
        </>
      )}
    </Gate>
  );
}
