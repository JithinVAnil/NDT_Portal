"use client";

import * as React from "react";
import { FileSpreadsheet, FileText, FileDown, Play } from "lucide-react";
import { api, download } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, LoadingBlock } from "@/components/ui/states";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { useToast } from "@/components/ui/toast";
import { cn, fmtDateTime } from "@/lib/utils";
import type { Batch, Role } from "@/types/api";

interface ReportDef {
  key: string;
  title: string;
  description: string;
  filters: string[];
  columns: { key: string; label: string }[];
}
interface ReportData {
  key: string;
  title: string;
  description: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  generated_at: string;
  generated_by: string;
  scope: string;
}

const STATUS_OPTIONS: Record<string, string[]> = {
  nominations: ["Draft", "Submitted", "Under Review", "Eligible", "Ineligible", "Approved", "Rejected", "Allocated", "Onboarded"],
  batches: ["Planned", "Active", "Completed", "Cancelled"],
  completion: ["In Progress", "Eligible for Completion", "Completed", "Not Completed"],
};
const BADGE_KEYS = new Set(["status", "risk", "result", "qc_status"]);

export function ReportsPage({ role }: { role: Role }) {
  const toast = useToast();
  const catalogue = useApi<ReportDef[]>("/reports");
  const courses = useApi<{ id: number; title: string }[]>("/courses/options");
  const depts = useApi<{ id: number; code: string; name: string }[]>(role === "ADMIN" ? "/departments/options" : null);
  const batches = useApi<Batch[]>("/batches");
  const history = useApi<{ id: number; report: string; format: string; rows: number; by: string; timestamp: string }[]>("/reports/history");
  const [key, setKey] = React.useState("programme-summary");
  const [filters, setFilters] = React.useState<Record<string, string>>({});
  const [report, setReport] = React.useState<ReportData | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const def = (catalogue.data ?? []).find((r) => r.key === key);

  const generate = async (k = key, f = filters) => {
    setBusy("gen");
    try {
      const res = await api<ReportData>(`/reports/${k}`, { query: f });
      setReport(res);
      history.reload();
    } catch (e) {
      toast.error("Report not generated", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };
  const exportAs = async (fmt: "csv" | "xlsx" | "pdf") => {
    setBusy(fmt);
    try {
      const name = await download(`/reports/${key}/export`, { ...filters, format: fmt }, `${key}.${fmt}`);
      toast.success("Export downloaded", name);
      history.reload();
    } catch (e) {
      toast.error("Export failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const columns: ColumnDef<Record<string, unknown>>[] = (report?.columns ?? []).map((c) => ({
    id: c.key,
    accessorFn: (r) => r[c.key] as string | number | null,
    header: c.label,
    cell: ({ getValue }) => {
      const v = getValue() as unknown;
      if (v === null || v === undefined || v === "") return <span className="text-subtle">—</span>;
      if (BADGE_KEYS.has(c.key)) {
        const s = String(v);
        const map: Record<string, string> = { "On Track": "ON_TRACK", "At Risk": "AT_RISK", Critical: "CRITICAL", "Not Started": "NOT_STARTED" };
        return <StatusBadge status={map[s] ?? s} />;
      }
      return <span className={typeof v === "number" ? "tabular" : ""}>{String(v)}</span>;
    },
  }));

  return (
    <>
      <PageHeader
        title="Reports"
        description={role === "ADMIN" ? "Programme reports generated from live data. Export locally as CSV, Excel or PDF." : "Reports scoped to your department."}
        breadcrumbs={[{ label: role === "ADMIN" ? "Administrator" : "Department" }, { label: "Reports" }]}
      />
      <div className="grid gap-4 xl:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Report catalogue" />
          <ul className="p-1.5">
            {(catalogue.data ?? []).map((r) => (
              <li key={r.key}>
                <button
                  onClick={() => {
                    setKey(r.key);
                    setFilters({});
                    setReport(null);
                  }}
                  className={cn(
                    "w-full rounded-md px-3 py-2 text-left text-[13px]",
                    r.key === key ? "bg-navy-900 text-white" : "hover:bg-canvas",
                  )}
                  aria-current={r.key === key ? "true" : undefined}
                >
                  <span className="font-medium">{r.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader
              title={def?.title ?? "Report"}
              description={def?.description}
              actions={role === "DEPARTMENT" ? <Badge tone="info">Department-scoped</Badge> : undefined}
            />
            <CardBody className="flex flex-wrap items-end gap-3">
              {def?.filters.includes("course_id") && (
                <Field label="Course" htmlFor="f-course" className="w-52">
                  <Select id="f-course" value={filters.course_id ?? ""} onChange={(e) => setFilters({ ...filters, course_id: e.target.value })}>
                    <option value="">All</option>
                    {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                  </Select>
                </Field>
              )}
              {role === "ADMIN" && def?.filters.includes("department_id") && (
                <Field label="Department" htmlFor="f-dept" className="w-52">
                  <Select id="f-dept" value={filters.department_id ?? ""} onChange={(e) => setFilters({ ...filters, department_id: e.target.value })}>
                    <option value="">All</option>
                    {(depts.data ?? []).map((d) => <option key={d.id} value={d.id}>{d.code} — {d.name}</option>)}
                  </Select>
                </Field>
              )}
              {def?.filters.includes("batch_id") && (
                <Field label="Batch" htmlFor="f-batch" className="w-60">
                  <Select id="f-batch" value={filters.batch_id ?? ""} onChange={(e) => setFilters({ ...filters, batch_id: e.target.value })}>
                    <option value="">All</option>
                    {(batches.data ?? []).map((b) => <option key={b.id} value={b.id}>{b.code}</option>)}
                  </Select>
                </Field>
              )}
              {def?.filters.includes("status") && STATUS_OPTIONS[key] && (
                <Field label="Status" htmlFor="f-status" className="w-48">
                  <Select id="f-status" value={filters.status ?? ""} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
                    <option value="">All</option>
                    {STATUS_OPTIONS[key].map((s) => <option key={s}>{s}</option>)}
                  </Select>
                </Field>
              )}
              <Button variant="primary" onClick={() => generate()} loading={busy === "gen"}>
                <Play /> Generate Report
              </Button>
              <div className="ml-auto flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => exportAs("csv")} loading={busy === "csv"}><FileDown /> Export CSV</Button>
                <Button variant="outline" onClick={() => exportAs("xlsx")} loading={busy === "xlsx"}><FileSpreadsheet /> Export Excel</Button>
                <Button variant="outline" onClick={() => exportAs("pdf")} loading={busy === "pdf"}><FileText /> Export PDF</Button>
              </div>
            </CardBody>
          </Card>
          <Card>
            {busy === "gen" && !report ? (
              <LoadingBlock rows={8} />
            ) : !report ? (
              <EmptyState title="No report generated yet" description="Choose filters and click Generate Report. Exports work without generating first." />
            ) : (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2.5 text-[12px] text-muted">
                  <span>
                    <b className="text-ink">{report.title}</b> · {report.rows.length} rows · {report.scope}
                  </span>
                  <span>Generated {fmtDateTime(report.generated_at)} by {report.generated_by}</span>
                </div>
                <DataTable key={report.key + report.generated_at} columns={columns} data={report.rows} pageSize={25} emptyTitle="No records found for these filters." caption={report.title} />
              </>
            )}
          </Card>
          <Card>
            <CardHeader title="Recent report activity" description="Each generation and export is logged and audited." />
            <DataTable
              data={history.data ?? []}
              searchable={false}
              pageSize={5}
              dense
              emptyTitle="No reports generated yet."
              columns={[
                { accessorKey: "timestamp", header: "Time", cell: ({ row }) => fmtDateTime(row.original.timestamp) },
                { accessorKey: "report", header: "Report" },
                { accessorKey: "format", header: "Format", cell: ({ row }) => <Badge tone={row.original.format === "VIEW" ? "neutral" : "info"}>{row.original.format}</Badge> },
                { accessorKey: "rows", header: "Rows" },
                { accessorKey: "by", header: "By" },
              ]}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
