"use client";

import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Building2,
  CalendarCheck,
  ClipboardList,
  GraduationCap,
  Layers,
  Target,
  Trophy,
  Users,
  Clapperboard,
} from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard, KpiGrid } from "@/components/kpi";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, KpiSkeleton, ProgressBar, Skeleton } from "@/components/ui/states";
import { GroupedBar, SimpleBar, StatusStack, STATUS, TrendLine } from "@/components/charts/charts";
import { Badge } from "@/components/ui/badge";
import { num, pct } from "@/lib/utils";
import type { ContentSummary, CourseCard, DashboardCharts, Kpis } from "@/types/api";

interface AdminDash {
  kpis: Kpis;
  charts: DashboardCharts;
  courses: CourseCard[];
  content: ContentSummary;
}

export const COMPLETION_STACK = [
  { key: "Completed", name: "Completed", color: STATUS.ok },
  { key: "Eligible", name: "Eligible for completion", color: STATUS.warn },
  { key: "In Progress", name: "In progress", color: STATUS.info },
  { key: "Not Completed", name: "Not completed", color: STATUS.bad },
];

export function RiskBars({ data }: { data: DashboardCharts["risk_distribution"] }) {
  const total = data.reduce((s, d) => s + d.count, 0) || 1;
  const color: Record<string, string> = { ON_TRACK: STATUS.ok, AT_RISK: STATUS.warn, CRITICAL: STATUS.bad, NOT_STARTED: STATUS.neutral };
  return (
    <ul className="space-y-3">
      {data.map((d) => (
        <li key={d.key}>
          <div className="mb-1 flex items-center justify-between text-[12.5px]">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color[d.key] }} aria-hidden />
              {d.level}
            </span>
            <span className="tabular font-semibold">
              {d.count} <span className="font-normal text-muted">({Math.round((100 * d.count) / total)}%)</span>
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[#e6eaf0]">
            <div className="h-full rounded-full" style={{ width: `${(100 * d.count) / total}%`, background: color[d.key] }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function CourseCards({ courses, base }: { courses: CourseCard[]; base?: string }) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      {courses.map((c) => {
        const inner = (
          <Card className="h-full p-4 transition-colors hover:border-brand-500">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Badge tone={c.level === "Foundation" ? "info" : "violet"}>{c.level}</Badge>
                <h3 className="mt-2 text-[14.5px] font-semibold text-navy-900">{c.title}</h3>
                <p className="mt-0.5 text-[11.5px] text-muted">{c.version} · {c.delivery_mode}</p>
              </div>
              <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[11px] text-muted">{c.code}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[12.5px]">
              <div>
                <dt className="text-muted">Learners</dt>
                <dd className="tabular font-semibold">{c.learners}</dd>
              </div>
              <div>
                <dt className="text-muted">Avg score</dt>
                <dd className="tabular font-semibold">{pct(c.average_score)}</dd>
              </div>
              <div>
                <dt className="text-muted">Content items</dt>
                <dd className="tabular font-semibold">
                  {c.content_count} <span className="font-normal text-muted">({c.video_count} videos)</span>
                </dd>
              </div>
              <div>
                <dt className="text-muted">Practicals</dt>
                <dd className="tabular font-semibold">{c.practical_count}</dd>
              </div>
            </dl>
            <div className="mt-3">
              <div className="mb-1 flex justify-between text-[12px]">
                <span className="text-muted">Completion</span>
                <span className="tabular font-semibold">{pct(c.completion_pct)}</span>
              </div>
              <ProgressBar value={c.completion_pct} tone="ok" size="sm" label={`${c.title} completion`} />
            </div>
          </Card>
        );
        return base ? (
          <Link key={c.id} href={`${base}/${c.id}`} className="block">
            {inner}
          </Link>
        ) : (
          <div key={c.id}>{inner}</div>
        );
      })}
    </div>
  );
}

export function AdminDashboard() {
  const { data, error, loading, reload } = useApi<AdminDash>("/dashboard/admin");
  const k = data?.kpis;

  return (
    <>
      <PageHeader
        title="Programme Dashboard"
        description="Live programme indicators computed from the portal database."
        breadcrumbs={[{ label: "Administrator" }, { label: "Dashboard" }]}
      />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading || !data || !k ? (
        <div className="space-y-4">
          <KpiSkeleton count={10} />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="space-y-5">
          <KpiGrid>
            <KpiCard label="Departments" value={num(k.departments)} sub="Active nominating departments" icon={Building2} href="/admin/departments" />
            <KpiCard label="Learners" value={num(k.learners)} sub={`${k.active_learners} in active training`} icon={Users} href="/admin/learners" />
            <KpiCard
              label="Pending Nominations"
              value={num(k.pending_nominations)}
              sub="Submitted · under review · eligible"
              icon={ClipboardList}
              tone={k.pending_nominations ? "warn" : "default"}
              href="/admin/nominations"
            />
            <KpiCard label="Active Batches" value={num(k.active_batches)} sub="Currently running" icon={Layers} href="/admin/batches" />
            <KpiCard label="Course Enrolments" value={num(k.enrolments)} sub="Course allocations" icon={BookOpen} />
            <KpiCard label="Attendance Rate" value={pct(k.attendance_rate, 1)} sub="Present + late ÷ marked" icon={CalendarCheck} href="/admin/attendance" />
            <KpiCard label="Average Progress" value={pct(k.average_progress, 1)} sub="Learners in training" icon={Activity} href="/admin/progress" />
            <KpiCard label="Average Score" value={pct(k.average_score, 1)} sub="All assessment results" icon={Target} href="/admin/assessments" />
            <KpiCard
              label="Completion"
              value={pct(k.completion_rate, 1)}
              sub={`${k.completed} completed · ${k.eligible_for_completion} eligible`}
              icon={Trophy}
              tone="ok"
            />
            <KpiCard
              label="At-Risk Learners"
              value={num(k.at_risk_learners)}
              sub={`${k.critical_learners} critical`}
              icon={AlertTriangle}
              tone={k.at_risk_learners ? "bad" : "ok"}
              href="/admin/progress?risk=AT_RISK,CRITICAL"
            />
          </KpiGrid>

          <Card>
            <CardHeader
              title="Content Production"
              icon={<Clapperboard className="h-4 w-4 text-muted" />}
              description="Recorded instructional content against the programme target — calculated from stored video durations."
              actions={<Link href="/admin/content-production" className="text-[12.5px] text-brand-600 hover:underline">Open production dashboard</Link>}
            />
            <CardBody className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
              <div>
                <p className="text-[12px] text-muted">Content produced</p>
                <p className="tabular text-[24px] font-semibold text-navy-900">
                  {data.content.total_hours.toFixed(1)} <span className="text-[15px] font-normal text-muted">/ {data.content.target_hours} hours</span>
                </p>
                <ProgressBar value={data.content.produced_pct} tone="brand" className="mt-2" label="Content produced vs target" />
                <p className="mt-1 text-[11.5px] text-muted">{pct(data.content.produced_pct, 1)} of target · demo content records</p>
              </div>
              <div>
                <p className="text-[12px] text-muted">Video records</p>
                <p className="tabular text-[20px] font-semibold">{data.content.total_videos}</p>
                <p className="text-[12px] text-muted">{data.content.videos_ready} QC-ready</p>
              </div>
              <div>
                <p className="text-[12px] text-muted">Pending QC / assets</p>
                <p className="tabular text-[20px] font-semibold">{data.content.videos_pending}</p>
                <p className="text-[12px] text-muted">{data.content.missing_captions} missing captions</p>
              </div>
              <div>
                <p className="text-[12px] text-muted">Practicals · Assessments</p>
                <p className="tabular text-[20px] font-semibold">
                  {data.content.practicals} · {data.content.assessments}
                </p>
                <p className="text-[12px] text-muted">{data.content.rubrics} rubrics · {data.content.exercises} exercises</p>
              </div>
            </CardBody>
          </Card>

          <div>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">Courses</h2>
            <CourseCards courses={data.courses} base="/admin/courses" />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Learners by Course" description="Course enrolments (allocated, assigned, onboarded, completed)" />
              <CardBody>
                <SimpleBar data={data.charts.learners_by_course} x="course" y="learners" name="Learners" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Course Completion" description="Completion status of enrolments in training" />
              <CardBody>
                <StatusStack data={data.charts.completion_by_course} x="course" stack={COMPLETION_STACK} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Attendance" description="Weekly attendance rate across all batches (last 8 weeks)" />
              <CardBody>
                <TrendLine data={data.charts.attendance_trend} x="week" y="rate" name="Attendance" unit="%" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Assessment Performance" description="Average score and pass rate by course" />
              <CardBody>
                <GroupedBar
                  data={data.charts.assessment_performance}
                  x="course"
                  unit="%"
                  max={100}
                  series={[
                    { key: "average_score", name: "Average score %" },
                    { key: "pass_rate", name: "Pass rate %" },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader
                title="Risk Distribution"
                description="Demo at-risk rules applied to learners in training"
                actions={<Link href="/admin/progress" className="text-[12.5px] text-brand-600 hover:underline">View learners</Link>}
              />
              <CardBody>
                <RiskBars data={data.charts.risk_distribution} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Department Performance" description="Average progress, attendance and score by department" />
              <CardBody>
                <GroupedBar
                  data={data.charts.department_performance ?? []}
                  x="department"
                  unit="%"
                  max={100}
                  series={[
                    { key: "average_progress", name: "Progress %" },
                    { key: "attendance_rate", name: "Attendance %" },
                    { key: "average_score", name: "Avg score %" },
                  ]}
                />
                <ul className="mt-3 space-y-1">
                  {(data.charts.department_performance ?? []).map((d) => (
                    <li key={d.department_id}>
                      <Link
                        href={`/admin/learners?department=${d.department_id}`}
                        className="flex items-center justify-between rounded-md border border-line px-3 py-1.5 text-[12.5px] hover:border-brand-500"
                      >
                        <span>
                          <span className="font-medium">{d.name}</span>{" "}
                          <span className="font-mono text-[11px] text-muted">{d.department}</span>
                        </span>
                        <span className="tabular text-muted">
                          {d.learners} learners · {pct(d.average_progress)} progress → <span className="text-brand-600">view learners</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader title="Nomination Pipeline" description="Current status of all nominations" icon={<GraduationCap className="h-4 w-4 text-muted" />} />
            <CardBody>
              <ol className="flex flex-wrap gap-2">
                {["Draft", "Submitted", "Under Review", "Eligible", "Ineligible", "Approved", "Rejected", "Allocated", "Onboarded"].map((s) => (
                  <li key={s}>
                    <Link
                      href={`/admin/nominations?status=${encodeURIComponent(s)}`}
                      className="flex min-w-[112px] flex-col rounded-md border border-line px-3 py-2 hover:border-brand-500"
                    >
                      <span className="text-[11.5px] text-muted">{s}</span>
                      <span className="tabular text-[18px] font-semibold text-navy-900">{k.nomination_status[s] ?? 0}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
