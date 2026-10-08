"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/form";
import { Alert, ErrorState, KeyValue, LoadingBlock, Skeleton } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { Badge } from "@/components/ui/badge";
import { hours } from "@/lib/utils";
import type { CourseCard, CourseTree, Rubric } from "@/types/api";
import { CourseCards } from "../dashboard/admin-dashboard";
import { CourseTreeView, HierarchyStrip } from "./course-tree";

export function RubricCard({ r }: { r: Rubric }) {
  return (
    <Card>
      <CardHeader title={r.title} description={r.description ?? undefined} actions={<Badge tone="neutral">Total {r.total_score}</Badge>} />
      <table className="w-full text-[12.5px]">
        <tbody>
          {r.criteria.map((c) => (
            <tr key={c.name} className="border-b border-line/70 last:border-0">
              <td className="px-4 py-1.5 font-medium">{c.name}</td>
              <td className="px-2 py-1.5 text-muted">{c.descriptor}</td>
              <td className="tabular px-4 py-1.5 text-right font-semibold">{c.max_score}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function CoursesPage() {
  const { data, error, loading, reload } = useApi<CourseCard[]>("/courses");
  const rubrics = useApi<Rubric[]>("/rubrics");
  return (
    <>
      <PageHeader
        title="Courses"
        description="Four digital courses of the programme. Open a course to see its complete structure."
        breadcrumbs={[{ label: "Administrator" }, { label: "Courses" }]}
      />
      <Card className="mb-4">
        <CardBody>
          <p className="mb-2 text-[12px] text-muted">
            Every course follows this structure — recorded video alone is <b>not</b> treated as a complete course:
          </p>
          <HierarchyStrip />
        </CardBody>
      </Card>
      {error && <ErrorState message={error} onRetry={reload} />}
      {loading || !data ? <Skeleton className="h-48" /> : <CourseCards courses={data} base="/admin/courses" />}
      <h2 className="mb-2 mt-6 text-[13px] font-semibold uppercase tracking-wide text-muted">Evaluation rubrics</h2>
      <div className="grid gap-3 lg:grid-cols-3">{(rubrics.data ?? []).map((r) => <RubricCard key={r.id} r={r} />)}</div>
    </>
  );
}

export function CourseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, error, loading, reload } = useApi<CourseTree>(`/courses/${id}`);
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", description: "", duration_minutes: "180" });
  const [err, setErr] = React.useState<string | null>(null);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={10} />;
  const c = data.course;

  const addModule = async () => {
    setErr(null);
    try {
      await api(`/courses/${id}/modules`, {
        body: { title: form.title, description: form.description || null, duration_minutes: Number(form.duration_minutes) || 60 },
      });
      toast.success("Module added", form.title);
      setOpen(false);
      setForm({ title: "", description: "", duration_minutes: "180" });
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not add module");
    }
  };

  return (
    <>
      <PageHeader
        title={c.title}
        badge={<Badge tone={c.level === "Foundation" ? "info" : "violet"}>{c.level}</Badge>}
        description={c.description ?? undefined}
        breadcrumbs={[{ label: "Administrator" }, { label: "Courses", href: "/admin/courses" }, { label: c.code }]}
        actions={<Button variant="outline" onClick={() => setOpen(true)}><Plus /> Add module</Button>}
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card>
          <CardHeader title="Course structure" description="Course → Module → Lesson → Video → Resource → Practical → Exercise → Assessment → Rubric" />
          <CourseTreeView tree={data} contentHref={(ci) => `/admin/content/${ci.id}`} />
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Course facts" />
            <CardBody>
              <KeyValue
                cols={1}
                items={[
                  ["Course code", c.code],
                  ["NDU course ref (demo)", <span key="n" className="font-mono">{c.ndu_course_ref}</span>],
                  ["Planned learning hours", `${c.planned_hours} h`],
                  ["Recorded video target", `${c.target_video_hours} h`],
                  ["Video content recorded", hours(data.counts.video_minutes)],
                  ["Minimum qualification", c.min_qualification],
                  ["Prerequisite", c.prerequisite ?? "None"],
                  ["Pass mark", `${c.pass_percentage}%`],
                  ["Minimum attendance", `${c.min_attendance}%`],
                  ["Target audience", c.target_audience],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Composition" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-3 text-[12.5px]">
                {Object.entries(data.counts).filter(([k]) => k !== "video_minutes").map(([k, v]) => (
                  <div key={k}>
                    <dt className="capitalize text-muted">{k}</dt>
                    <dd className="tabular text-[17px] font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardBody>
          </Card>
        </div>
      </div>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="Add module"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={addModule} disabled={form.title.trim().length < 3}>Add module</Button></>}
      >
        {err && <Alert tone="bad" className="mb-3">{err}</Alert>}
        <div className="space-y-3">
          <Field label="Module title" htmlFor="m-t" required><Input id="m-t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Description" htmlFor="m-d"><Textarea id="m-d" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label="Duration (minutes)" htmlFor="m-m"><Input id="m-m" type="number" value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} /></Field>
        </div>
      </Dialog>
    </>
  );
}
