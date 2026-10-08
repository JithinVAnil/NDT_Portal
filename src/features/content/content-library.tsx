"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert, ErrorState, LoadingBlock } from "@/components/ui/states";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import type { ContentItem } from "@/types/api";

export function ContentLibraryPage() {
  const router = useRouter();
  const toast = useToast();
  const [course, setCourse] = React.useState("");
  const [type, setType] = React.useState("");
  const [status, setStatus] = React.useState("");
  const { data, error, loading, reload } = useApi<ContentItem[]>("/content", { course_id: course, content_type: type, overall_status: status });
  const courses = useApi<{ id: number; title: string }[]>("/courses/options");
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", course_id: "", content_type: "Video", duration_minutes: "10", instructor: "", description: "" });
  const [err, setErr] = React.useState<string | null>(null);

  const create = async () => {
    setErr(null);
    try {
      const c = await api<ContentItem>("/content", {
        body: {
          title: form.title, course_id: Number(form.course_id), content_type: form.content_type,
          duration_minutes: form.content_type === "Video" ? Number(form.duration_minutes) : 0,
          instructor: form.instructor || null, description: form.description || null,
        },
      });
      toast.success("Content record created", `${c.code} · ${c.title}`);
      setOpen(false);
      router.push(`/admin/content/${c.id}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not create");
    }
  };

  const columns: ColumnDef<ContentItem>[] = [
    { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-[12px] font-semibold">{row.original.code}</span> },
    {
      accessorKey: "title",
      header: "Title",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.title}</p>
          <p className="text-[11.5px] text-muted">
            {row.original.module ? `M${row.original.module_sequence}: ${row.original.module}` : ""}
            {row.original.lesson ? ` › ${row.original.lesson}` : ""}
          </p>
        </div>
      ),
    },
    { accessorKey: "content_type", header: "Type", cell: ({ row }) => <Badge tone={row.original.content_type === "Video" ? "info" : "neutral"}>{row.original.content_type}</Badge> },
    { accessorKey: "course_code", header: "Course" },
    { accessorKey: "instructor", header: "Instructor", cell: ({ row }) => <span className="text-[12.5px]">{row.original.instructor ?? "—"}</span> },
    {
      accessorKey: "duration_minutes",
      header: "Duration",
      cell: ({ row }) =>
        row.original.content_type === "Video" ? (
          <span className="tabular">
            {row.original.duration_minutes} min{row.original.is_deep_dive && <span className="ml-1 text-[11px] text-muted">deep</span>}
          </span>
        ) : "—",
    },
    { accessorKey: "production_status", header: "Production" },
    { accessorKey: "overall_status", header: "QC status", cell: ({ row }) => (row.original.content_type === "Video" ? <StatusBadge status={row.original.overall_status} /> : "—") },
    {
      accessorKey: "has_video",
      header: "Asset",
      cell: ({ row }) => (row.original.content_type !== "Video" ? "—" : row.original.has_video ? <Badge tone="ok">Uploaded</Badge> : <Badge tone="neutral">To be inserted</Badge>),
    },
  ];

  return (
    <>
      <PageHeader
        title="Digital Content Library"
        description="Instructional video and resource records. These are demo content records; the portal is ready to accept the final videos."
        breadcrumbs={[{ label: "Administrator" }, { label: "Content Library" }]}
        actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus /> New content record</Button>}
      />
      <Alert tone="warn" className="mb-4" title="Demo content records">
        Records represent the planned instructional-content ecosystem. Sample records are not final NIELIT deliverables; actual videos will be inserted when produced.
      </Alert>
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock rows={8} /> : (
          <DataTable
            columns={columns}
            data={data ?? []}
            searchPlaceholder="Search content…"
            onRowClick={(c) => router.push(`/admin/content/${c.id}`)}
            emptyTitle="No content records found."
            caption="Content library"
            toolbar={
              <>
                <Select value={course} onChange={(e) => setCourse(e.target.value)} className="w-52" aria-label="Course">
                  <option value="">All courses</option>
                  {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </Select>
                <Select value={type} onChange={(e) => setType(e.target.value)} className="w-32" aria-label="Type">
                  <option value="">All types</option>
                  <option>Video</option>
                  <option>Resource</option>
                </Select>
                <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="QC status">
                  <option value="">Any QC status</option>
                  {["Ready", "Pending QC", "Pending Assets", "Needs Review"].map((s) => <option key={s}>{s}</option>)}
                </Select>
              </>
            }
          />
        )}
      </Card>
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="New content record"
        footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button variant="primary" onClick={create} disabled={!form.title || !form.course_id}>Create</Button></>}
      >
        {err && <Alert tone="bad" className="mb-3">{err}</Alert>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Title" htmlFor="c-t" required className="sm:col-span-2"><Input id="c-t" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Course" htmlFor="c-c" required>
            <Select id="c-c" value={form.course_id} onChange={(e) => setForm({ ...form, course_id: e.target.value })}>
              <option value="">Select…</option>
              {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </Field>
          <Field label="Type" htmlFor="c-ty">
            <Select id="c-ty" value={form.content_type} onChange={(e) => setForm({ ...form, content_type: e.target.value })}>
              <option>Video</option>
              <option>Resource</option>
            </Select>
          </Field>
          {form.content_type === "Video" && (
            <Field label="Planned duration (min)" htmlFor="c-d" hint="8–12 min normal; up to 20 min for deep demonstrations">
              <Input id="c-d" type="number" min={1} max={60} value={form.duration_minutes} onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })} />
            </Field>
          )}
          <Field label="Instructor" htmlFor="c-i"><Input id="c-i" value={form.instructor} onChange={(e) => setForm({ ...form, instructor: e.target.value })} /></Field>
          <Field label="Description" htmlFor="c-de" className="sm:col-span-2"><Textarea id="c-de" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        </div>
      </Dialog>
    </>
  );
}
