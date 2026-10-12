"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CheckCheck, FileUp, QrCode, Save, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Alert, EmptyState, ErrorState, LoadingBlock, ProgressBar } from "@/components/ui/states";
import { DataTable } from "@/components/data-table";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn, pct } from "@/lib/utils";
import type { Batch, Role } from "@/types/api";

type Status = "Present" | "Absent" | "Late" | "Excused";
const STATUSES: Status[] = ["Present", "Absent", "Late", "Excused"];
const TONE: Record<Status, string> = {
  Present: "border-ok bg-ok text-white",
  Absent: "border-bad bg-bad text-white",
  Late: "border-saffron bg-saffron text-white",
  Excused: "border-[#6b7586] bg-[#6b7586] text-white",
};

interface Sheet {
  batch: Batch;
  session: { id: number; title: string | null; attendance_marked: boolean; date: string; session_no: number } | null;
  rows: { learner_id: number; learner: string; learner_code: string; department_code: string; status: Status | null; remarks: string | null; attendance_pct: number | null }[];
  can_edit: boolean;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function AttendancePage({ role }: { role: Role }) {
  const params = useSearchParams();
  const toast = useToast();
  const { refresh } = useAuth();
  const batches = useApi<Batch[]>("/batches");
  const usable = (batches.data ?? []).filter((b) => b.status === "Active" || b.status === "Completed");
  const [batchId, setBatchId] = React.useState(params.get("batch") ?? "");
  const [date, setDate] = React.useState(localToday());
  const [sessionNo, setSessionNo] = React.useState("1");
  const [marks, setMarks] = React.useState<Record<number, Status | null>>({});
  const [saving, setSaving] = React.useState(false);
  const [lastSave, setLastSave] = React.useState<{ rate: number | null; counts: Record<string, number> } | null>(null);
  const [bulkOpen, setBulkOpen] = React.useState(false);
  const [bulkText, setBulkText] = React.useState("");
  const [bulkErr, setBulkErr] = React.useState<string | null>(null);
  const [placeholder, setPlaceholder] = React.useState<"qr" | "otp" | null>(null);

  React.useEffect(() => {
    if (!batchId && usable.length) {
      const active = usable.find((b) => b.status === "Active") ?? usable[0];
      setBatchId(String(active.id));
    }
  }, [usable, batchId]);

  const sheet = useApi<Sheet>(batchId ? "/attendance/sheet" : null, { batch_id: batchId, session_date: date, session_no: sessionNo });
  const summary = useApi<{ learner_id: number; learner: string; learner_code: string; department_code: string; batch: string; course: string; sessions_attended: number; sessions_marked: number; attendance_pct: number | null }[]>(
    "/attendance/summary",
    { batch_id: batchId },
  );

  React.useEffect(() => {
    if (sheet.data) {
      setMarks(Object.fromEntries(sheet.data.rows.map((r) => [r.learner_id, r.status])));
      setLastSave(null);
    }
  }, [sheet.data]);

  const canEdit = role === "ADMIN" && !!sheet.data?.can_edit;
  const batch = usable.find((b) => String(b.id) === batchId);
  const unmarked = sheet.data ? sheet.data.rows.filter((r) => !marks[r.learner_id]).length : 0;

  const save = async () => {
    if (!sheet.data) return;
    setSaving(true);
    try {
      const records = sheet.data.rows.filter((r) => marks[r.learner_id]).map((r) => ({ learner_id: r.learner_id, status: marks[r.learner_id] }));
      const res = await api<{ saved: number; counts: Record<string, number>; warnings: number; batch_attendance_rate: number | null }>("/attendance/sheet", {
        body: { batch_id: Number(batchId), session_date: date, session_no: Number(sessionNo), records },
      });
      setLastSave({ rate: res.batch_attendance_rate, counts: res.counts });
      toast.success(
        "Attendance saved",
        `${res.saved} learners · batch attendance now ${pct(res.batch_attendance_rate, 1)}${res.warnings ? ` · ${res.warnings} attendance warning(s) issued` : ""}`,
      );
      sheet.reload();
      summary.reload();
      refresh();
    } catch (e) {
      toast.error("Attendance not saved", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const applyBulk = () => {
    if (!sheet.data) return;
    setBulkErr(null);
    const byCode = new Map(sheet.data.rows.map((r) => [r.learner_code.toLowerCase(), r.learner_id]));
    const next: Record<number, Status | null> = { ...marks };
    let applied = 0;
    const bad: string[] = [];
    for (const line of bulkText.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.toLowerCase().startsWith("learner_code")) continue;
      const [codeRaw, statusRaw] = trimmed.split(",");
      const code = (codeRaw ?? "").trim().toLowerCase();
      const st = (statusRaw ?? "").trim();
      if (!code) continue;
      const id = byCode.get(code);
      if (!id) { bad.push(code); continue; }
      if (!STATUSES.includes(st as Status)) { bad.push(`${code} (invalid status '${st}')`); continue; }
      next[id] = st as Status;
      applied += 1;
    }
    if (!applied && bad.length) { setBulkErr("No rows applied. Check learner codes and statuses."); return; }
    setMarks(next);
    setBulkOpen(false);
    setBulkText("");
    toast.success("Bulk attendance applied", `${applied} learner(s) updated${bad.length ? ` · ${bad.length} row(s) skipped` : ""}. Review and save.`);
  };

  return (
    <>
      <PageHeader
        title="Attendance Management"
        description={role === "ADMIN" ? "Record session attendance. Saving updates attendance rates, dashboards, learner records and the audit trail." : "Attendance of your department's learners (view only)."}
        breadcrumbs={[{ label: role === "ADMIN" ? "Administrator" : "Department" }, { label: "Attendance" }]}
      />
      <Card className="mb-4">
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="Batch" htmlFor="att-batch" className="w-[340px] max-w-full">
            <Select id="att-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
              {usable.length === 0 && <option value="">No batches found.</option>}
              {usable.map((b) => (
                <option key={b.id} value={b.id}>{b.code} · {b.status}</option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="att-date">
            <Input id="att-date" type="date" value={date} max={localToday()} min={batch?.start_date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Session" htmlFor="att-sess">
            <Select id="att-sess" value={sessionNo} onChange={(e) => setSessionNo(e.target.value)} className="w-32">
              {[1, 2, 3].map((n) => <option key={n} value={n}>Session {n}</option>)}
            </Select>
          </Field>
          {batch && (
            <p className="pb-2 text-[12px] text-muted">
              {batch.course} · {batch.mode} · {batch.start_date} → {batch.end_date}
            </p>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader
            title="Attendance sheet"
            description={
              sheet.data?.session
                ? `${sheet.data.session.title ?? "Session"} · ${sheet.data.session.attendance_marked ? "already marked — saving will update it" : "not yet marked"}`
                : "No session exists for this date yet — saving will create it."
            }
            actions={
              canEdit && sheet.data && sheet.data.rows.length > 0 ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setPlaceholder("qr")}>
                    <QrCode /> QR check-in
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPlaceholder("otp")}>
                    <KeyRound /> OTP check-in
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setBulkErr(null); setBulkOpen(true); }}>
                    <FileUp /> Bulk upload
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setMarks(Object.fromEntries(sheet.data!.rows.map((r) => [r.learner_id, "Present" as Status])))}>
                    <CheckCheck /> Mark All Present
                  </Button>
                  <Button size="sm" variant="primary" loading={saving} disabled={unmarked === sheet.data.rows.length} onClick={save}>
                    <Save /> Save Attendance
                  </Button>
                </>
              ) : undefined
            }
          />
          {sheet.error ? (
            <ErrorState message={sheet.error} onRetry={sheet.reload} />
          ) : sheet.loading && !sheet.data ? (
            <LoadingBlock />
          ) : !sheet.data || sheet.data.rows.length === 0 ? (
            <EmptyState title="No onboarded learners in this batch." />
          ) : (
            <>
              {lastSave && (
                <Alert tone="ok" className="m-4 mb-0">
                  Saved — {Object.entries(lastSave.counts).map(([k, v]) => `${k} ${v}`).join(", ")}. Batch attendance rate: <b>{pct(lastSave.rate, 1)}</b>.
                </Alert>
              )}
              <div className="scroll-thin overflow-x-auto">
                <table className="w-full text-[13px]">
                  <caption className="sr-only">Attendance sheet</caption>
                  <thead>
                    <tr className="border-b border-line bg-[#f7f9fb] text-left text-[11.5px] uppercase tracking-wide text-muted">
                      <th scope="col" className="px-4 py-2">Learner</th>
                      <th scope="col" className="px-3 py-2">Attendance to date</th>
                      {STATUSES.map((s) => <th key={s} scope="col" className="px-2 py-2 text-center">{s}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sheet.data.rows.map((r) => (
                      <tr key={r.learner_id} className="border-b border-line/70">
                        <td className="px-4 py-2">
                          <p className="font-medium">{r.learner}</p>
                          <p className="text-[11.5px] text-muted">{r.learner_code} · {r.department_code}</p>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex w-32 items-center gap-2">
                            <ProgressBar value={r.attendance_pct ?? 0} size="sm" tone={r.attendance_pct !== null && r.attendance_pct < 75 ? "bad" : "ok"} />
                            <span className="tabular text-[12px]">{pct(r.attendance_pct)}</span>
                          </div>
                        </td>
                        {STATUSES.map((s) => (
                          <td key={s} className="px-2 py-2 text-center">
                            <button
                              type="button"
                              disabled={!canEdit}
                              onClick={() => setMarks((m) => ({ ...m, [r.learner_id]: s }))}
                              className={cn(
                                "h-7 w-16 rounded border text-[11.5px] font-medium disabled:cursor-default",
                                marks[r.learner_id] === s ? TONE[s] : "border-line bg-white text-muted hover:border-brand-500",
                              )}
                              aria-pressed={marks[r.learner_id] === s}
                              aria-label={`${r.learner}: ${s}`}
                            >
                              {s}
                            </button>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {canEdit && unmarked > 0 && <p className="px-4 py-2 text-[12px] text-muted">{unmarked} learner(s) not marked — they will be left unchanged.</p>}
            </>
          )}
        </Card>

        <Card>
          <CardHeader title="Attendance summary" description="Learners sorted from lowest attendance. Minimum requirement 75% (demo rule)." />
          {summary.loading && !summary.data ? (
            <LoadingBlock />
          ) : (
            <DataTable
              data={summary.data ?? []}
              searchable={false}
              pageSize={10}
              dense
              emptyTitle="No attendance records available."
              columns={[
                { accessorKey: "learner", header: "Learner", cell: ({ row }) => <span className="font-medium">{row.original.learner}</span> },
                { id: "s", header: "Sessions", accessorFn: (r) => r.sessions_marked, cell: ({ row }) => <span className="tabular">{row.original.sessions_attended}/{row.original.sessions_marked}</span> },
                {
                  accessorKey: "attendance_pct",
                  header: "Rate",
                  cell: ({ row }) => (
                    <span className={cn("tabular font-semibold", (row.original.attendance_pct ?? 100) < 60 ? "text-bad" : (row.original.attendance_pct ?? 100) < 75 ? "text-warn" : "text-ok")}>
                      {pct(row.original.attendance_pct, 1)}
                    </span>
                  ),
                },
              ]}
            />
          )}
        </Card>
      </div>

      <Dialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Bulk attendance upload"
        description="Paste CSV rows: learner_code,status — e.g. SCIB-EMP-5101,Present. Matching learners are marked on the sheet; review then save."
        footer={
          <>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={applyBulk} disabled={!bulkText.trim()}>Apply to sheet</Button>
          </>
        }
      >
        {bulkErr && <Alert tone="bad" className="mb-3">{bulkErr}</Alert>}
        <Alert tone="info" className="mb-3">
          Accepted statuses: Present, Absent, Late, Excused. The first line may be a header and is skipped.
        </Alert>
        <textarea
          className="h-44 w-full rounded-md border border-line bg-white p-3 font-mono text-[12.5px] focus:border-brand-500 focus:outline-none"
          placeholder={"learner_code,status\nSCIB-EMP-5101,Present\nSCIB-EMP-5102,Absent"}
          value={bulkText}
          onChange={(e) => setBulkText(e.target.value)}
          aria-label="Bulk attendance CSV"
        />
      </Dialog>

      <Dialog
        open={placeholder !== null}
        onOpenChange={(o) => !o && setPlaceholder(null)}
        title={placeholder === "qr" ? "QR check-in (demo placeholder)" : "OTP check-in (demo placeholder)"}
        footer={<Button variant="primary" onClick={() => setPlaceholder(null)}>Close</Button>}
      >
        <Alert tone="info">
          {placeholder === "qr"
            ? "Learners would scan a session QR code shown on the trainer's screen; the portal would mark them Present via the NDU/mobile integration. No QR service is wired in this prototype — use the sheet or bulk upload to record attendance."
            : "Learners would receive a one-time code (SMS/email) and submit it to check in. No OTP provider is wired in this prototype — use the sheet or bulk upload to record attendance."}
        </Alert>
      </Dialog>
    </>
  );
}
