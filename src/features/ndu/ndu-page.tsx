"use client";

import * as React from "react";
import { ArrowRight, CloudCog, RefreshCcw, UploadCloud, UserCheck, Trophy, Zap } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard, KpiGrid } from "@/components/kpi";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert, KpiSkeleton, LoadingBlock } from "@/components/ui/states";
import { DataTable } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { fmtDateTime, pct } from "@/lib/utils";
import type { SyncLog } from "@/types/api";

interface Status {
  label: string;
  integration_status: string;
  mode: string;
  ndu_platform: string;
  note: string;
  last_sync: string | null;
  learners_synced: number;
  courses_synced: number;
  progress_synced: number;
  completion_synced: number;
  total_enrollments: number;
  sync_success: number;
  sync_failure: number;
}
interface NduEnr {
  id: number;
  enrollment_id: number | null;
  learner_id: number;
  learner: string;
  learner_code: string;
  course: string;
  batch: string | null;
  ndu_learner_ref: string;
  ndu_course_ref: string;
  sync_status: string;
  ndu_progress_pct: number;
  portal_progress_pct: number | null;
  modules: string | null;
  last_synced_at: string | null;
}
interface SimResult {
  learner: string;
  course: string;
  old_progress: number;
  new_progress: number;
  old_modules: number;
  new_modules: number;
  modules_total: number;
  message: string;
}

export function NduPage() {
  const toast = useToast();
  const status = useApi<Status>("/ndu/status");
  const enrs = useApi<NduEnr[]>("/ndu/enrollments");
  const logs = useApi<SyncLog[]>("/ndu/logs", { limit: 300 });
  const [selected, setSelected] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [sim, setSim] = React.useState<SimResult | null>(null);
  const [tab, setTab] = React.useState("enrolments");
  const s = status.data;
  const active = (enrs.data ?? []).filter((e) => e.enrollment_id);

  React.useEffect(() => {
    if (!selected && active.length) {
      const demo = active.find((e) => e.learner === "Arjun Mehta") ?? active[0];
      setSelected(String(demo.enrollment_id));
    }
  }, [active, selected]);

  const refreshAll = () => {
    status.reload();
    enrs.reload();
    logs.reload();
  };
  const sel = active.find((e) => String(e.enrollment_id) === selected);

  const run = async (k: string, path: string, body: unknown, label: string) => {
    setBusy(k);
    try {
      const r = await api<{ synced: number; failed: number }>(`/ndu/${path}`, { body });
      toast.success(label, `${r.synced} record(s) synchronised${r.failed ? `, ${r.failed} failed` : ""} (demo)`);
      refreshAll();
    } catch (e) {
      toast.error("Sync failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };
  const simulate = async () => {
    setBusy("sim");
    try {
      const r = await api<SimResult>("/ndu/simulate-update", { body: { enrollment_id: Number(selected) } });
      setSim(r);
      toast.success("NDU update received (demo)", `${r.learner}: ${r.old_progress.toFixed(0)}% → ${r.new_progress.toFixed(0)}%`);
      refreshAll();
    } catch (e) {
      toast.error("Simulation failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="NDU Integration"
        badge={<Badge tone="warn">Prototype / Demo NDU Integration</Badge>}
        description="Integration layer between this portal and NIELIT Digital University (ndu.digital), the primary learning platform."
        breadcrumbs={[{ label: "Administrator" }, { label: "NDU Integration" }]}
      />
      <Alert tone="warn" className="mb-4" title="Mode: DEMO — no real NDU API is called">
        {s?.note ?? "A local mock adapter simulates enrolment, learner, progress and completion synchronisation. Real integration requires official NDU API documentation and credentials."}
      </Alert>

      {!s ? <KpiSkeleton count={8} /> : (
        <KpiGrid cols={4}>
          <KpiCard label="Integration Status" value={<span className="text-[17px]">{s.integration_status}</span>} sub={`Mode: ${s.mode} · ${s.ndu_platform}`} icon={CloudCog} />
          <KpiCard label="Last Sync" value={<span className="text-[17px]">{fmtDateTime(s.last_sync)}</span>} icon={RefreshCcw} />
          <KpiCard label="Learners Synced" value={s.learners_synced} sub={`of ${s.total_enrollments} NDU enrolments`} icon={UserCheck} />
          <KpiCard label="Courses Synced" value={s.courses_synced} icon={UploadCloud} />
          <KpiCard label="Progress Synced" value={s.progress_synced} icon={RefreshCcw} />
          <KpiCard label="Completion Synced" value={s.completion_synced} icon={Trophy} />
          <KpiCard label="Sync Success" value={s.sync_success} tone="ok" />
          <KpiCard label="Sync Failure" value={s.sync_failure} tone={s.sync_failure ? "bad" : "ok"} />
        </KpiGrid>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader title="Synchronisation actions" description="Push portal data to the demo NDU adapter." />
          <CardBody className="flex flex-wrap gap-2">
            <Button variant="outline" loading={busy === "l"} onClick={() => run("l", "sync-learner", {}, "Learner sync completed")}><UserCheck /> Sync Learner</Button>
            <Button variant="outline" loading={busy === "p"} onClick={() => run("p", "sync-progress", {}, "Progress sync completed")}><RefreshCcw /> Sync Progress</Button>
            <Button variant="outline" loading={busy === "c"} onClick={() => run("c", "sync-completion", {}, "Completion sync completed")}><Trophy /> Sync Completion</Button>
            <Button variant="ghost" onClick={() => setTab("logs")}>View Sync Logs</Button>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Simulate NDU Update" description="Simulates NDU reporting new module/video completion for a learner. Stored with old value, new value, timestamp, learner, course and result." />
          <CardBody className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Learner enrolment" htmlFor="sim-l" className="min-w-[280px] flex-1">
                <Select id="sim-l" value={selected} onChange={(e) => { setSelected(e.target.value); setSim(null); }}>
                  {active.map((e) => (
                    <option key={e.id} value={e.enrollment_id ?? ""}>
                      {e.learner} · {e.course} · {pct(e.portal_progress_pct)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button variant="primary" loading={busy === "sim"} onClick={simulate} disabled={!selected}>
                <Zap /> Simulate NDU Update
              </Button>
            </div>
            {sel && !sim && (
              <p className="text-[12.5px] text-muted">
                Current: progress <b className="tabular text-ink">{pct(sel.portal_progress_pct)}</b> · modules {sel.modules} · NDU ref{" "}
                <span className="font-mono">{sel.ndu_learner_ref}</span>
              </p>
            )}
            {sim && (
              <div className="rounded-md border border-[#bfe3cf] bg-ok-bg px-4 py-3">
                <p className="text-[12px] font-semibold text-ok">{sim.learner} · {sim.course}</p>
                <div className="mt-1 flex items-center gap-4">
                  <div>
                    <p className="text-[11px] uppercase text-muted">Before</p>
                    <p className="tabular text-[24px] font-semibold text-ink">{sim.old_progress.toFixed(0)}%</p>
                  </div>
                  <ArrowRight className="h-5 w-5 text-ok" />
                  <div>
                    <p className="text-[11px] uppercase text-muted">After</p>
                    <p className="tabular text-[24px] font-semibold text-ok">{sim.new_progress.toFixed(0)}%</p>
                  </div>
                  <p className="text-[12px] text-muted">
                    Modules {sim.old_modules} → {sim.new_modules}/{sim.modules_total}
                  </p>
                </div>
                <p className="mt-1 text-[11.5px] text-muted">{sim.message}</p>
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="mt-4">
        <TabsList>
          <TabsTrigger value="enrolments">NDU enrolments ({enrs.data?.length ?? 0})</TabsTrigger>
          <TabsTrigger value="logs">Sync logs ({logs.data?.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="enrolments">
          <Card>
            {enrs.loading && !enrs.data ? <LoadingBlock /> : (
              <DataTable
                data={enrs.data ?? []}
                searchPlaceholder="Search learner, NDU reference…"
                columns={[
                  { accessorKey: "learner", header: "Learner", cell: ({ row }) => <div><p className="font-medium">{row.original.learner}</p><p className="text-[11.5px] text-muted">{row.original.learner_code}</p></div> },
                  { accessorKey: "course", header: "Course" },
                  { accessorKey: "batch", header: "Batch", cell: ({ row }) => <span className="text-[12px]">{row.original.batch}</span> },
                  { accessorKey: "ndu_learner_ref", header: "NDU learner ref", cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.ndu_learner_ref}</span> },
                  { accessorKey: "ndu_course_ref", header: "NDU course ref", cell: ({ row }) => <span className="font-mono text-[11.5px]">{row.original.ndu_course_ref}</span> },
                  { accessorKey: "portal_progress_pct", header: "Portal %", cell: ({ row }) => <span className="tabular">{pct(row.original.portal_progress_pct)}</span> },
                  { accessorKey: "ndu_progress_pct", header: "NDU %", cell: ({ row }) => <span className="tabular">{pct(row.original.ndu_progress_pct)}</span> },
                  { accessorKey: "sync_status", header: "Status", cell: ({ row }) => <StatusBadge status={row.original.sync_status} /> },
                  { accessorKey: "last_synced_at", header: "Last synced", cell: ({ row }) => fmtDateTime(row.original.last_synced_at) },
                ]}
              />
            )}
          </Card>
        </TabsContent>
        <TabsContent value="logs">
          <Card>
            {logs.loading && !logs.data ? <LoadingBlock /> : (
              <DataTable
                data={logs.data ?? []}
                searchPlaceholder="Search sync logs…"
                columns={[
                  { accessorKey: "timestamp", header: "Timestamp", cell: ({ row }) => <span className="whitespace-nowrap text-[12px]">{fmtDateTime(row.original.timestamp)}</span> },
                  { accessorKey: "sync_type", header: "Type" },
                  { accessorKey: "direction", header: "Direction", cell: ({ row }) => <span className="text-[12px]">{row.original.direction}</span> },
                  { accessorKey: "learner", header: "Learner" },
                  { accessorKey: "course", header: "Course", cell: ({ row }) => <span className="text-[12px]">{row.original.course}</span> },
                  { id: "chg", header: "Old → New", cell: ({ row }) => (row.original.old_value || row.original.new_value ? <span className="tabular">{row.original.old_value ?? "—"} → {row.original.new_value ?? "—"}</span> : "—") },
                  { accessorKey: "result", header: "Result", cell: ({ row }) => <StatusBadge status={row.original.result} /> },
                  { accessorKey: "message", header: "Message", cell: ({ row }) => <span className="text-[12px] text-muted">{row.original.message}</span> },
                ]}
              />
            )}
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
