"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { CalendarCheck, Pencil, Plus } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Badge, RiskBadge, StatusBadge } from "@/components/ui/badge";
import { Alert, ErrorState, KeyValue, LoadingBlock, ProgressBar } from "@/components/ui/states";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { fmtDate, pct } from "@/lib/utils";
import type { Batch, Role } from "@/types/api";

const EMPTY = {
  code: "", name: "", course_id: "", department_id: "", mode: "Digital", location: "", start_date: "", end_date: "",
  capacity: "30", instructor: "", status: "Planned",
};

function BatchForm({ open, onOpenChange, batch, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; batch?: Batch | null; onSaved: (b: Batch) => void }) {
  const toast = useToast();
  const courses = useApi<{ id: number; title: string; code: string }[]>(open ? "/courses/options" : null);
  const depts = useApi<{ id: number; code: string; name: string }[]>(open ? "/departments/options" : null);
  const [f, setF] = React.useState(EMPTY);
  const [err, setErr] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  React.useEffect(() => {
    if (!open) return;
    setErr(null);
    setF(
      batch
        ? {
            code: batch.code, name: batch.name, course_id: String(batch.course_id), department_id: batch.department_id ? String(batch.department_id) : "",
            mode: batch.mode, location: batch.location ?? "", start_date: batch.start_date, end_date: batch.end_date, capacity: String(batch.capacity),
            instructor: batch.instructor ?? "", status: batch.status,
          }
        : EMPTY,
    );
  }, [open, batch]);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const save = async () => {
    setSaving(true);
    setErr(null);
    try {
      const body = {
        ...f, course_id: Number(f.course_id), department_id: f.department_id ? Number(f.department_id) : null, capacity: Number(f.capacity),
        location: f.location || null, instructor: f.instructor || null,
      };
      const res = batch
        ? await api<Batch>(`/batches/${batch.id}`, { method: "PUT", body })
        : await api<Batch>("/batches", { body });
      toast.success(batch ? "Batch updated" : "Batch created", res.code);
      onSaved(res);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={batch ? `Edit ${batch.code}` : "Create batch"}
      footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button variant="primary" loading={saving} onClick={save}>Save batch</Button></>}
    >
      {err && <Alert tone="bad" className="mb-3">{err}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Batch ID" htmlFor="b-code" required hint="e.g. CLOUD-FORENSICS-2026-03"><Input id="b-code" value={f.code} onChange={set("code")} /></Field>
        <Field label="Batch name" htmlFor="b-name" required><Input id="b-name" value={f.name} onChange={set("name")} /></Field>
        <Field label="Course" htmlFor="b-course" required>
          <Select id="b-course" value={f.course_id} onChange={set("course_id")}>
            <option value="">Select…</option>
            {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </Select>
        </Field>
        <Field label="Department" htmlFor="b-dept" hint="Leave as multi-department for shared batches">
          <Select id="b-dept" value={f.department_id} onChange={set("department_id")}>
            <option value="">Multi-department</option>
            {(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Mode" htmlFor="b-mode" required>
          <Select id="b-mode" value={f.mode} onChange={set("mode")}>
            <option>Physical</option>
            <option>Digital</option>
            <option>Hybrid</option>
          </Select>
        </Field>
        <Field label="Location" htmlFor="b-loc"><Input id="b-loc" value={f.location} onChange={set("location")} /></Field>
        <Field label="Start date" htmlFor="b-s" required><Input id="b-s" type="date" value={f.start_date} onChange={set("start_date")} /></Field>
        <Field label="End date" htmlFor="b-e" required><Input id="b-e" type="date" value={f.end_date} onChange={set("end_date")} /></Field>
        <Field label="Capacity" htmlFor="b-cap" required><Input id="b-cap" type="number" min={1} value={f.capacity} onChange={set("capacity")} /></Field>
        <Field label="Instructor" htmlFor="b-ins"><Input id="b-ins" value={f.instructor} onChange={set("instructor")} /></Field>
        <Field label="Status" htmlFor="b-st">
          <Select id="b-st" value={f.status} onChange={set("status")}>
            {["Planned", "Active", "Completed", "Cancelled"].map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}

export function BatchesPage({ role }: { role: Role }) {
  const router = useRouter();
  const base = role === "ADMIN" ? "/admin" : "/department";
  const [status, setStatus] = React.useState("");
  const { data, error, loading, reload } = useApi<Batch[]>("/batches", { status });
  const [open, setOpen] = React.useState(false);

  const columns: ColumnDef<Batch>[] = [
    {
      accessorKey: "code",
      header: "Batch ID",
      cell: ({ row }) => (
        <div>
          <p className="font-mono text-[12px] font-semibold text-navy-800">{row.original.code}</p>
          <p className="text-[11.5px] text-muted">{row.original.name}</p>
        </div>
      ),
    },
    { accessorKey: "course", header: "Course" },
    { accessorKey: "mode", header: "Mode", cell: ({ row }) => <Badge tone={row.original.mode === "Digital" ? "info" : row.original.mode === "Hybrid" ? "violet" : "neutral"}>{row.original.mode}</Badge> },
    { accessorKey: "location", header: "Location", cell: ({ row }) => <span className="text-[12.5px]">{row.original.location}</span> },
    { accessorKey: "start_date", header: "Start", cell: ({ row }) => fmtDate(row.original.start_date) },
    { accessorKey: "end_date", header: "End", cell: ({ row }) => fmtDate(row.original.end_date) },
    {
      accessorKey: "enrolled",
      header: "Enrolment",
      cell: ({ row }) => (
        <div className="w-28">
          <p className="tabular text-[12px]">
            {row.original.enrolled}/{row.original.capacity}
            {role === "DEPARTMENT" && <span className="text-muted"> · {row.original.department_learners} yours</span>}
          </p>
          <ProgressBar value={(100 * (row.original.enrolled ?? 0)) / row.original.capacity} size="sm" tone="brand" />
        </div>
      ),
    },
    { accessorKey: "instructor", header: "Instructor", cell: ({ row }) => <span className="text-[12.5px]">{row.original.instructor}</span> },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
  ];

  return (
    <>
      <PageHeader
        title="Batch Management"
        description={role === "ADMIN" ? "Physical, digital and hybrid batches for all courses." : "Batches that include your department's learners."}
        breadcrumbs={[{ label: role === "ADMIN" ? "Administrator" : "Department" }, { label: "Batches" }]}
        actions={role === "ADMIN" && <Button variant="primary" onClick={() => setOpen(true)}><Plus /> Create batch</Button>}
      />
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : (
          <DataTable
            columns={columns}
            data={data ?? []}
            emptyTitle="No batches found."
            onRowClick={(b) => router.push(`${base}/batches/${b.id}`)}
            caption="Batches"
            toolbar={
              <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-40" aria-label="Status">
                <option value="">All statuses</option>
                {["Planned", "Active", "Completed", "Cancelled"].map((s) => <option key={s}>{s}</option>)}
              </Select>
            }
          />
        )}
      </Card>
      {role === "ADMIN" && (
        <BatchForm open={open} onOpenChange={setOpen} onSaved={(b) => { setOpen(false); router.push(`/admin/batches/${b.id}`); }} />
      )}
    </>
  );
}

interface BatchDetail extends Batch {
  roster: {
    learner_id: number;
    learner: string;
    learner_code: string;
    department_code: string;
    designation: string | null;
    status: string;
    onboarded_at: string | null;
    progress: number | null;
    attendance: number | null;
    average_score: number | null;
    risk_level: string | null;
  }[];
  sessions: { id: number; date: string; session_no: number; title: string | null; start_time: string | null; end_time: string | null; attendance_marked: boolean; counts: Record<string, number> }[];
}

export function BatchDetailPage({ role }: { role: Role }) {
  const { id } = useParams<{ id: string }>();
  const base = role === "ADMIN" ? "/admin" : "/department";
  const { data, error, loading, reload } = useApi<BatchDetail>(`/batches/${id}`);
  const [edit, setEdit] = React.useState(false);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={10} />;
  const b = data;
  const today = new Date().toISOString().slice(0, 10);
  return (
    <>
      <PageHeader
        title={<span className="font-mono">{b.code}</span>}
        badge={<StatusBadge status={b.status} />}
        description={`${b.name} · ${b.course}`}
        breadcrumbs={[{ label: role === "ADMIN" ? "Administrator" : "Department" }, { label: "Batches", href: `${base}/batches` }, { label: b.code }]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href={`${base}/attendance?batch=${b.id}`}><CalendarCheck /> Attendance</Link>
            </Button>
            {role === "ADMIN" && <Button variant="outline" onClick={() => setEdit(true)}><Pencil /> Edit batch</Button>}
          </>
        }
      />
      <div className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title={`Learners (${b.roster.length})`} description={role === "DEPARTMENT" ? "Only your department's learners are listed." : undefined} />
          <DataTable
            data={b.roster}
            searchable={b.roster.length > 10}
            emptyTitle="No learners found."
            emptyDescription="Learners appear here after batch allocation."
            columns={[
              {
                accessorKey: "learner",
                header: "Learner",
                cell: ({ row }) => (
                  <Link href={`${base}/learners/${row.original.learner_id}`} className="hover:underline">
                    <p className="font-medium text-brand-600">{row.original.learner}</p>
                    <p className="text-[11.5px] text-muted">{row.original.learner_code} · {row.original.department_code}</p>
                  </Link>
                ),
              },
              { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
              { accessorKey: "progress", header: "Progress", cell: ({ row }) => <span className="tabular">{pct(row.original.progress)}</span> },
              { accessorKey: "attendance", header: "Attendance", cell: ({ row }) => <span className="tabular">{pct(row.original.attendance)}</span> },
              { accessorKey: "average_score", header: "Avg score", cell: ({ row }) => <span className="tabular">{pct(row.original.average_score)}</span> },
              { accessorKey: "risk_level", header: "Risk", cell: ({ row }) => <RiskBadge level={row.original.risk_level} /> },
            ]}
          />
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Batch details" />
            <CardBody>
              <KeyValue
                cols={1}
                items={[
                  ["Course", b.course],
                  ["Mode", b.mode],
                  ["Location", b.location],
                  ["Schedule", `${fmtDate(b.start_date)} – ${fmtDate(b.end_date)}`],
                  ["Capacity", `${b.enrolled}/${b.capacity} enrolled`],
                  ["Instructor", b.instructor],
                  ["Department", b.department],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title={`Sessions (${b.sessions.length})`} />
            <div className="scroll-thin max-h-[420px] overflow-y-auto">
              {b.sessions.length === 0 ? (
                <p className="px-4 py-3 text-[13px] text-muted">No sessions scheduled yet.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {b.sessions.map((s) => (
                    <li key={s.id} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                      <span className="tabular w-[86px] shrink-0 font-medium">{fmtDate(s.date)}</span>
                      <span className="min-w-0 flex-1 truncate text-muted">{s.title}</span>
                      {s.attendance_marked ? (
                        <Badge tone="ok">{(s.counts.Present ?? 0) + (s.counts.Late ?? 0)} present</Badge>
                      ) : s.date <= today ? (
                        <Badge tone="warn">Not marked</Badge>
                      ) : (
                        <Badge tone="neutral">Upcoming</Badge>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Card>
        </div>
      </div>
      {role === "ADMIN" && <BatchForm open={edit} onOpenChange={setEdit} batch={b} onSaved={() => { setEdit(false); reload(); }} />}
    </>
  );
}
