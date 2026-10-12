"use client";

import * as React from "react";
import { Download, FileSpreadsheet, Upload } from "lucide-react";
import { api, download } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Select } from "@/components/ui/form";
import { Alert } from "@/components/ui/states";
import { StatusBadge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface PreviewRow {
  row: number;
  data: Record<string, string>;
  status: "Valid" | "Invalid" | "Duplicate";
  errors: string[];
  duplicate_reason: string | null;
  course_code: string | null;
  eligibility: string | null;
  eligibility_notes: string[];
}
interface Preview {
  filename: string;
  rows: PreviewRow[];
  summary: { total: number; valid: number; invalid: number; duplicate: number; eligible: number; review_required: number; ineligible: number };
}

const STEPS = ["Upload", "Parse", "Validate", "Preview", "Errors", "Confirm", "Import"];

export function BulkImport({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; onDone: () => void }) {
  const toast = useToast();
  const courses = useApi<{ id: number; code: string; title: string }[]>(open ? "/courses/options" : null);
  const [file, setFile] = React.useState<File | null>(null);
  const [courseId, setCourseId] = React.useState("");
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [createNoms, setCreateNoms] = React.useState(true);
  const [submitNow, setSubmitNow] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<{ created: number; nominations: string[]; skipped: number } | null>(null);
  const stage = result ? 6 : preview ? (preview.summary.invalid + preview.summary.duplicate > 0 ? 4 : 5) : file ? 1 : 0;

  const reset = () => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setError(null);
  };

  const runPreview = async () => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<Preview>("/learners/import/preview", { form: fd, query: { course_id: courseId || undefined } });
      setPreview(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse the file");
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ created: number; nominations: string[]; skipped: number }>("/learners/import/confirm", {
        body: {
          rows: preview.rows.map((r) => r.data),
          course_id: courseId ? Number(courseId) : null,
          create_nominations: createNoms,
          submit: submitNow,
        },
      });
      setResult(res);
      toast.success("Import complete", `${res.created} learners, ${res.nominations.length} nominations created`);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      size="xl"
      title="Bulk Import Learners"
      description="Upload a CSV or Excel (.xlsx) file. Rows are validated and checked against the demo eligibility rules before import."
      footer={
        result ? (
          <Button onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
        ) : preview ? (
          <>
            <Button variant="outline" onClick={() => setPreview(null)}>Back</Button>
            <Button variant="primary" onClick={confirm} loading={busy} disabled={preview.summary.valid === 0}>
              Confirm import of {preview.summary.valid} valid row{preview.summary.valid === 1 ? "" : "s"}
            </Button>
          </>
        ) : (
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button variant="primary" onClick={runPreview} loading={busy} disabled={!file}>
              <Upload /> Upload &amp; validate
            </Button>
          </>
        )
      }
    >
      <ol className="mb-4 flex flex-wrap items-center gap-1 text-[11.5px]" aria-label="Import steps">
        {STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-1">
            <span
              className={cn(
                "rounded px-2 py-0.5 font-medium",
                i < stage ? "bg-ok-bg text-ok" : i === stage ? "bg-navy-900 text-white" : "bg-canvas text-muted",
              )}
            >
              {i + 1}. {s}
            </span>
            {i < STEPS.length - 1 && <span className="text-subtle">›</span>}
          </li>
        ))}
      </ol>
      {error && <Alert tone="bad" className="mb-3">{error}</Alert>}

      {result ? (
        <Alert tone="ok" title="Import completed">
          {result.created} learner record(s) created
          {result.nominations.length ? ` and ${result.nominations.length} nomination(s) (${submitNow ? "submitted" : "draft"})` : ""}.{" "}
          {result.skipped} row(s) skipped (invalid or duplicate).
        </Alert>
      ) : !preview ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => download("/learners/import/template", undefined, "learner_import_template.csv")}>
              <Download /> Download CSV template
            </Button>
            <Button variant="outline" size="sm" onClick={() => download("/learners/import/template", { format: "xlsx" }, "learner_import_template.xlsx")}>
              <FileSpreadsheet /> Download Excel template
            </Button>
            <span className="text-[12px] text-muted">
              Columns: employee_id, full_name, email, mobile, designation, qualification, department_code, location, course_code
            </span>
          </div>
          <label
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-line bg-canvas/60 px-6 py-10 text-center hover:border-brand-500"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
          >
            <FileSpreadsheet className="h-8 w-8 text-subtle" />
            <span className="text-[13px] font-medium">{file ? file.name : "Drop a .csv or .xlsx file here, or click to browse"}</span>
            {file && <span className="text-[12px] text-muted">{(file.size / 1024).toFixed(1)} KB</span>}
            <input type="file" accept=".csv,.xlsx" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </label>
          <Field label="Default course (used when a row has no course_code)" htmlFor="defcourse">
            <Select id="defcourse" value={courseId} onChange={(e) => setCourseId(e.target.value)} className="max-w-sm">
              <option value="">None</option>
              {(courses.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>{c.title}</option>
              ))}
            </Select>
          </Field>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-7">
            {[
              ["Total records", preview.summary.total, ""],
              ["Valid", preview.summary.valid, "text-ok"],
              ["Invalid", preview.summary.invalid, "text-bad"],
              ["Duplicate", preview.summary.duplicate, "text-warn"],
              ["Eligible", preview.summary.eligible, "text-ok"],
              ["Review req.", preview.summary.review_required, "text-warn"],
              ["Ineligible", preview.summary.ineligible, "text-bad"],
            ].map(([l, v, c]) => (
              <div key={l as string} className="rounded-md border border-line px-3 py-2">
                <p className="text-[11px] text-muted">{l}</p>
                <p className={cn("tabular text-[18px] font-semibold", c as string)}>{v}</p>
              </div>
            ))}
          </div>
          <div className="scroll-thin max-h-[340px] overflow-auto rounded-md border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="sticky top-0 bg-[#f7f9fb] text-left text-[11px] uppercase text-muted">
                <tr>
                  <th className="px-2 py-1.5">Row</th>
                  <th className="px-2 py-1.5">Name</th>
                  <th className="px-2 py-1.5">Employee ID</th>
                  <th className="px-2 py-1.5">Email</th>
                  <th className="px-2 py-1.5">Course</th>
                  <th className="px-2 py-1.5">Validation</th>
                  <th className="px-2 py-1.5">Eligibility</th>
                  <th className="px-2 py-1.5">Errors / notes</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((r) => (
                  <tr key={r.row} className={cn("border-t border-line align-top", r.status !== "Valid" && "bg-bad-bg/40")}>
                    <td className="px-2 py-1.5 tabular">{r.row}</td>
                    <td className="px-2 py-1.5">{r.data.full_name}</td>
                    <td className="px-2 py-1.5 font-mono text-[11.5px]">{r.data.employee_id}</td>
                    <td className="px-2 py-1.5">{r.data.email}</td>
                    <td className="px-2 py-1.5">{r.course_code ?? "—"}</td>
                    <td className="px-2 py-1.5">
                      <StatusBadge status={r.status === "Valid" ? "Success" : r.status === "Invalid" ? "Failure" : "Pending"} />
                      <span className="ml-1 text-[11.5px] text-muted">{r.status}</span>
                    </td>
                    <td className="px-2 py-1.5">{r.eligibility ? <StatusBadge status={r.eligibility} /> : "—"}</td>
                    <td className="px-2 py-1.5 text-[12px] text-muted">
                      {[...r.errors, ...(r.duplicate_reason ? [r.duplicate_reason] : []), ...r.eligibility_notes].join("; ") || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-5">
            <Checkbox checked={createNoms} onChange={setCreateNoms} label="Create nominations for rows with a course" />
            <Checkbox checked={submitNow} onChange={setSubmitNow} disabled={!createNoms} label="Submit nominations to NIELIT immediately" />
          </div>
          <p className="text-[12px] text-muted">Only valid rows are imported. Invalid and duplicate rows are skipped.</p>
        </div>
      )}
    </Dialog>
  );
}
