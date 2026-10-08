"use client";

import Link from "next/link";
import { Activity, AlertTriangle, CalendarCheck, CheckCircle2, ClipboardList, Layers, Plus, Trophy, Users } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard, KpiGrid } from "@/components/kpi";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ErrorState, KpiSkeleton, Skeleton } from "@/components/ui/states";
import { GroupedBar, SimpleBar, TrendLine } from "@/components/charts/charts";
import { Button } from "@/components/ui/button";
import { num, pct } from "@/lib/utils";
import type { CourseCard, DashboardCharts, Kpis } from "@/types/api";
import { CourseCards, RiskBars } from "./admin-dashboard";

interface DeptDash {
  department: { id: number; name: string; code: string };
  kpis: Kpis;
  charts: DashboardCharts;
  courses: CourseCard[];
}

export function DepartmentDashboard() {
  const { data, error, loading, reload } = useApi<DeptDash>("/dashboard/department");
  const k = data?.kpis;
  return (
    <>
      <PageHeader
        title={data ? `${data.department.name}` : "Department Dashboard"}
        description="Department-scoped view — only your department's learners, nominations and results are shown."
        breadcrumbs={[{ label: "Department In-Charge" }, { label: "Dashboard" }]}
        actions={
          <Button asChild variant="primary">
            <Link href="/department/nominations?new=1">
              <Plus /> New nomination
            </Link>
          </Button>
        }
      />
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading || !data || !k ? (
        <div className="space-y-4">
          <KpiSkeleton count={8} />
          <Skeleton className="h-72" />
        </div>
      ) : (
        <div className="space-y-5">
          <KpiGrid cols={4}>
            <KpiCard label="Total Learners" value={num(k.learners)} sub={`${k.active_learners} in active training`} icon={Users} href="/department/learners" />
            <KpiCard
              label="Pending Nominations"
              value={num(k.pending_nominations)}
              sub="Draft · submitted · under review · eligible"
              icon={ClipboardList}
              tone={k.pending_nominations ? "warn" : "default"}
              href="/department/nominations"
            />
            <KpiCard label="Approved Nominations" value={num(k.approved_nominations)} sub="Approved · allocated · onboarded" icon={CheckCircle2} tone="ok" />
            <KpiCard label="Active Batches" value={num(k.active_batches)} sub="With your learners" icon={Layers} href="/department/batches" />
            <KpiCard label="Attendance" value={pct(k.attendance_rate, 1)} icon={CalendarCheck} href="/department/attendance" />
            <KpiCard label="Average Progress" value={pct(k.average_progress, 1)} icon={Activity} href="/department/progress" />
            <KpiCard label="Completion" value={pct(k.completion_rate, 1)} sub={`${k.completed} completed`} icon={Trophy} tone="ok" />
            <KpiCard
              label="At-Risk Learners"
              value={num(k.at_risk_learners)}
              sub={`${k.critical_learners} critical`}
              icon={AlertTriangle}
              tone={k.at_risk_learners ? "bad" : "ok"}
              href="/department/progress"
            />
          </KpiGrid>

          <div>
            <h2 className="mb-2 text-[13px] font-semibold uppercase tracking-wide text-muted">Assigned courses</h2>
            <CourseCards courses={data.courses} />
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Course Distribution" description="Your learners' course enrolments" />
              <CardBody>
                <SimpleBar data={data.charts.learners_by_course} x="course" y="learners" name="Learners" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Learner Progress" description="Distribution of overall progress for learners in training" />
              <CardBody>
                <SimpleBar data={data.charts.progress_distribution} x="range" y="learners" name="Learners" />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Attendance" description="Weekly attendance rate (last 8 weeks)" />
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
          </div>
          <Card>
            <CardHeader title="Risk Distribution" description="Demo at-risk rules applied to your learners in training" />
            <CardBody className="max-w-xl">
              <RiskBars data={data.charts.risk_distribution} />
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
