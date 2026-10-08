"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FileUp, Plus, Send } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorState, LoadingBlock } from "@/components/ui/states";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { useToast } from "@/components/ui/toast";
import { fmtDate } from "@/lib/utils";
import type { Nomination, Role } from "@/types/api";
import { NominationForm } from "./nomination-form";
import { BulkImport } from "./bulk-import";

const STATUSES = ["Draft", "Submitted", "Under Review", "Eligible", "Ineligible", "Approved", "Rejected", "Allocated", "Onboarded"];
const ADMIN_PENDING = "Submitted,Under Review,Eligible";

export function NominationsPage({ role }: { role: Role }) {
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const base = role === "ADMIN" ? "/admin" : "/department";
  const [status, setStatus] = React.useState<string>(params.get("status") ?? (role === "ADMIN" ? ADMIN_PENDING : ""));
  const [course, setCourse] = React.useState("");
  const [openNew, setOpenNew] = React.useState(params.get("new") === "1");
  const [openImport, setOpenImport] = React.useState(false);
  const [selected, setSelected] = React.useState<number[]>([]);
  const { data, error, loading, reload } = useApi<Nomination[]>("/nominations", { status, course_id: course });
  const summary = useApi<Record<string, number>>("/nominations/summary");
  const courses = useApi<{ id: number; title: string }[]>("/courses/options");
  const drafts = (data ?? []).filter((n) => n.status === "Draft");

  const refresh = () => {
    reload();
    summary.reload();
  };

  const bulkSubmit = async () => {
    try {
      const r = await api<{ submitted: number }>("/nominations/bulk-submit", { body: { nomination_ids: selected } });
      toast.success(`${r.submitted} nomination(s) submitted to NIELIT`);
      setSelected([]);
      refresh();
    } catch (e) {
      toast.error("Bulk submit failed", e instanceof Error ? e.message : undefined);
    }
  };

  const columns: ColumnDef<Nomination>[] = [
    ...(role === "DEPARTMENT"
      ? [
          {
            id: "select",
            header: () => <span className="sr-only">Select</span>,
            enableSorting: false,
            cell: ({ row }: { row: { original: Nomination } }) =>
              row.original.status === "Draft" ? (
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[#1f5fbf]"
                  aria-label={`Select ${row.original.nomination_no}`}
                  checked={selected.includes(row.original.id)}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? [...s, row.original.id] : s.filter((x) => x !== row.original.id)))
                  }
                />
              ) : null,
          } as ColumnDef<Nomination>,
        ]
      : []),
    {
      accessorKey: "nomination_no",
      header: "Nomination",
      cell: ({ row }) => <span className="font-mono text-[12px] font-medium text-navy-800">{row.original.nomination_no}</span>,
    },
    {
      id: "learner",
      accessorFn: (n) => `${n.learner.full_name} ${n.learner.learner_code} ${n.learner.employee_id}`,
      header: "Learner",
      cell: ({ row }) => (
        <div>
          <p className="font-medium">{row.original.learner.full_name}</p>
          <p className="text-[11.5px] text-muted">
            {row.original.learner.learner_code} · {row.original.learner.designation ?? "—"}
          </p>
        </div>
      ),
    },
    ...(role === "ADMIN" ? [{ accessorKey: "department_code", header: "Dept" } as ColumnDef<Nomination>] : []),
    { accessorKey: "course", header: "Course" },
    { accessorKey: "training_mode", header: "Mode" },
    {
      accessorKey: "eligibility_result",
      header: "Eligibility",
      cell: ({ row }) => <StatusBadge status={row.original.eligibility_result} />,
    },
    { accessorKey: "status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.status} /> },
    { accessorKey: "allocated_batch", header: "Batch", cell: ({ row }) => row.original.allocated_batch ?? <span className="text-subtle">—</span> },
    { accessorKey: "updated_at", header: "Updated", cell: ({ row }) => fmtDate(row.original.updated_at) },
  ];

  return (
    <>
      <PageHeader
        title="Nomination Management"
        description={
          role === "ADMIN"
            ? "Review departmental nominations, run eligibility checks, approve and allocate learners."
            : "Create, submit and track nominations for your department."
        }
        breadcrumbs={[{ label: role === "ADMIN" ? "Administrator" : "Department" }, { label: "Nominations" }]}
        actions={
          <>
            <Button variant="outline" onClick={() => setOpenImport(true)}>
              <FileUp /> Bulk import
            </Button>
            <Button variant="primary" onClick={() => setOpenNew(true)}>
              <Plus /> New nomination
            </Button>
          </>
        }
      />

      <div className="scroll-thin mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Filter by status">
        {(role === "ADMIN" ? [{ label: "Pending review", value: ADMIN_PENDING }] : []).concat(
          [{ label: "All", value: "" }],
          STATUSES.map((s) => ({ label: s, value: s })),
        ).map((t) => {
          const count =
            t.value === ""
              ? Object.values(summary.data ?? {}).reduce((a, b) => a + b, 0)
              : t.value.split(",").reduce((a, s) => a + (summary.data?.[s] ?? 0), 0);
          const active = status === t.value;
          return (
            <button
              key={t.label}
              role="tab"
              aria-selected={active}
              onClick={() => setStatus(t.value)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[12.5px] ${
                active ? "border-navy-900 bg-navy-900 text-white" : "border-line bg-white text-ink hover:border-brand-500"
              }`}
            >
              {t.label}
              <span className={`tabular rounded px-1 text-[11px] ${active ? "bg-white/20" : "bg-canvas text-muted"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      <Card>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingBlock rows={8} />
        ) : (
          <DataTable
            columns={columns}
            data={data ?? []}
            searchPlaceholder="Search nomination, learner, ID…"
            emptyTitle="No nominations found."
            emptyDescription="Try a different status filter or create a new nomination."
            onRowClick={(n) => router.push(`${base}/nominations/${n.id}`)}
            caption="Nominations"
            toolbar={
              <>
                <Select value={course} onChange={(e) => setCourse(e.target.value)} className="w-56" aria-label="Filter by course">
                  <option value="">All courses</option>
                  {(courses.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </Select>
                {role === "DEPARTMENT" && drafts.length > 0 && (
                  <Button size="sm" variant="primary" disabled={!selected.length} onClick={bulkSubmit}>
                    <Send /> Submit selected ({selected.length})
                  </Button>
                )}
              </>
            }
          />
        )}
      </Card>

      <NominationForm
        open={openNew}
        onOpenChange={setOpenNew}
        onCreated={(n) => {
          setOpenNew(false);
          router.push(`${base}/nominations/${n.id}`);
        }}
      />
      <BulkImport open={openImport} onOpenChange={setOpenImport} onDone={refresh} />
    </>
  );
}
