"use client";

import * as React from "react";
import { Save, FlaskConical } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { DataTable, type ColumnDef } from "@/components/data-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { fmtDate, pct } from "@/lib/utils";
import type { AssessmentDef, AssessmentResult, Practical, Role, Submission } from "@/types/api";
import { RubricCard } from "../courses/courses-page";

function ResultsTab({ role }: { role: Role }) {
  const [course, setCourse] = React.useState("");
  const courses = useApi<{ id: number; title: string }[]>("/courses/options");
  const { data, error, loading, reload } = useApi<AssessmentResult[]>("/assessment-results", { course_id: course });
  const columns: ColumnDef<AssessmentResult>[] = [
    { accessorKey: "learner", header: "Learner", cell: ({ row }) => <div><p className="font-medium">{row.original.learner}</p><p className="text-[11.5px] text-muted">{row.original.learner_code} · {row.original.department_code}</p></div> },
    { accessorKey: "course", header: "Course" },
    { accessorKey: "module", header: "Module", cell: ({ row }) => <span className="text-[12.5px]">{row.original.module ?? "Course-level"}</span> },
    { accessorKey: "assessment", header: "Assessment", cell: ({ row }) => <div><p>{row.original.assessment}</p><p className="text-[11.5px] text-muted">{row.original.assessment_type}</p></div> },
    { id: "score", header: "Score", accessorFn: (r) => r.score, cell: ({ row }) => <span className="tabular">{row.original.score} / {row.original.max_score}</span> },
    { accessorKey: "percentage", header: "%", cell: ({ row }) => <span className="tabular font-semibold">{pct(row.original.percentage)}</span> },
    { accessorKey: "passed", header: "Result", cell: ({ row }) => <StatusBadge status={row.original.passed ? "Pass" : "Fail"} /> },
    { accessorKey: "evaluator", header: "Evaluator" },
    { accessorKey: "remarks", header: "Remarks", cell: ({ row }) => <span className="text-[12px] text-muted">{row.original.remarks ?? "—"}</span> },
    { accessorKey: "evaluated_at", header: "Date", cell: ({ row }) => fmtDate(row.original.evaluated_at) },
  ];
  return (
    <Card>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : (
        <DataTable
          columns={columns}
          data={data ?? []}
          emptyTitle="No assessment records available."
          searchPlaceholder="Search learner, assessment…"
          caption="Assessment results"
          toolbar={
            <Select value={course} onChange={(e) => setCourse(e.target.value)} className="w-56" aria-label="Course">
              <option value="">All courses</option>
              {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          }
        />
      )}
      {role === "DEPARTMENT" && <p className="px-4 pb-3 text-[12px] text-muted">Results are recorded by NIELIT evaluators; departments have view access.</p>}
    </Card>
  );
}

interface EligibleLearner {
  learner_id: number;
  learner: string;
  learner_code: string;
  batch: string | null;
  existing: AssessmentResult | null;
}

function RecordTab() {
  const toast = useToast();
  const courses = useApi<{ id: number; title: string }[]>("/courses/options");
  const [course, setCourse] = React.useState("");
  const assessments = useApi<AssessmentDef[]>(course ? "/assessments" : null, { course_id: course });
  const [aid, setAid] = React.useState("");
  const learners = useApi<EligibleLearner[]>(aid ? "/assessment-results/eligible-learners" : null, { assessment_id: aid });
  const [lid, setLid] = React.useState("");
  const [score, setScore] = React.useState("");
  const [remarks, setRemarks] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [saved, setSaved] = React.useState<(AssessmentResult & { progress?: { overall_pct: number; average_score: number | null; risk_level: string } }) | null>(null);
  const a = (assessments.data ?? []).find((x) => String(x.id) === aid);
  const chosen = (learners.data ?? []).find((x) => String(x.learner_id) === lid);

  React.useEffect(() => {
    if (courses.data?.length && !course) {
      const clf = courses.data.find((c) => c.title.includes("Cloud")) ?? courses.data[0];
      setCourse(String(clf.id));
    }
  }, [courses.data, course]);
  React.useEffect(() => {
    setAid("");
    setLid("");
  }, [course]);
  React.useEffect(() => {
    if (chosen?.existing) {
      setScore(String(chosen.existing.score));
      setRemarks(chosen.existing.remarks ?? "");
    } else {
      setScore("");
      setRemarks("");
    }
    setSaved(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lid]);

  const num = Number(score);
  const invalid = score === "" || Number.isNaN(num) || num < 0 || (a ? num > a.max_score : false);
  const save = async () => {
    setBusy(true);
    try {
      const res = await api<AssessmentResult & { progress: { overall_pct: number; average_score: number | null; risk_level: string } }>("/assessment-results", {
        body: { learner_id: Number(lid), assessment_id: Number(aid), score: num, remarks: remarks || null },
      });
      setSaved(res);
      toast.success("Assessment score saved", `${res.learner}: ${res.score}/${res.max_score} (${pct(res.percentage)}) — ${res.passed ? "Pass" : "Fail"}`);
      learners.reload();
    } catch (e) {
      toast.error("Score not saved", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader title="Enter assessment score" description="Scores persist immediately and update progress, averages and risk." />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Course" htmlFor="r-course">
              <Select id="r-course" value={course} onChange={(e) => setCourse(e.target.value)}>
                {(courses.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </Select>
            </Field>
            <Field label="Assessment" htmlFor="r-ass">
              <Select id="r-ass" value={aid} onChange={(e) => setAid(e.target.value)}>
                <option value="">Select…</option>
                {(assessments.data ?? []).map((x) => (
                  <option key={x.id} value={x.id}>{x.type}: {x.title}</option>
                ))}
              </Select>
            </Field>
          </div>
          {a && (
            <p className="text-[12px] text-muted">
              {a.module ? `Module: ${a.module} · ` : "Course-level · "}Maximum score {a.max_score} · pass mark {a.pass_percentage}%{a.rubric ? ` · rubric: ${a.rubric.title}` : ""}
            </p>
          )}
          <Field label="Learner" htmlFor="r-l">
            <Select id="r-l" value={lid} onChange={(e) => setLid(e.target.value)} disabled={!aid}>
              <option value="">{aid ? "Select learner…" : "Select an assessment first"}</option>
              {(learners.data ?? []).map((l) => (
                <option key={l.learner_id} value={l.learner_id}>
                  {l.learner} · {l.learner_code} · {l.batch}{l.existing ? ` — current ${l.existing.score}/${l.existing.max_score}` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-[160px_1fr]">
            <Field label="Score" htmlFor="r-score" error={score !== "" && invalid ? `Enter 0–${a?.max_score ?? ""}` : undefined}>
              <div className="flex items-center gap-2">
                <Input id="r-score" type="number" step="0.5" min={0} max={a?.max_score} value={score} onChange={(e) => setScore(e.target.value)} disabled={!lid} />
                <span className="text-[13px] text-muted">/ {a?.max_score ?? "—"}</span>
              </div>
            </Field>
            <Field label="Remarks" htmlFor="r-rem">
              <Input id="r-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={!lid} />
            </Field>
          </div>
          {a && score !== "" && !invalid && (
            <p className="text-[12.5px]">
              Percentage <b className="tabular">{((100 * num) / a.max_score).toFixed(1)}%</b> ·{" "}
              <StatusBadge status={(100 * num) / a.max_score >= a.pass_percentage ? "Pass" : "Fail"} />
            </p>
          )}
          <Button variant="primary" onClick={save} loading={busy} disabled={!lid || invalid}>
            <Save /> {chosen?.existing ? "Update score" : "Save score"}
          </Button>
          {saved && (
            <Alert tone="ok" title="Saved and persisted">
              {saved.learner} — {saved.assessment}: {saved.score}/{saved.max_score} ({pct(saved.percentage)}). Progress now{" "}
              {pct(saved.progress?.overall_pct)} · average score {pct(saved.progress?.average_score, 1)} · risk{" "}
              {saved.progress?.risk_level.replace("_", " ").toLowerCase()}.
            </Alert>
          )}
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Learners for this assessment" />
        {!aid ? (
          <EmptyState title="Select an assessment" description="Onboarded learners of the course will be listed with their current scores." />
        ) : learners.loading && !learners.data ? (
          <LoadingBlock />
        ) : (
          <DataTable
            data={learners.data ?? []}
            searchable={false}
            pageSize={10}
            dense
            emptyTitle="No onboarded learners in this course."
            onRowClick={(l) => setLid(String(l.learner_id))}
            columns={[
              { accessorKey: "learner", header: "Learner", cell: ({ row }) => <span className="font-medium">{row.original.learner}</span> },
              { accessorKey: "batch", header: "Batch" },
              {
                id: "res",
                header: "Current",
                cell: ({ row }) =>
                  row.original.existing ? (
                    <span className="tabular">{row.original.existing.score}/{row.original.existing.max_score} <StatusBadge status={row.original.existing.passed ? "Pass" : "Fail"} /></span>
                  ) : (
                    <Badge tone="warn">Pending</Badge>
                  ),
              },
            ]}
          />
        )}
      </Card>
    </div>
  );
}

function PracticalsTab({ role }: { role: Role }) {
  const toast = useToast();
  const practicals = useApi<Practical[]>("/practicals");
  const [pid, setPid] = React.useState("");
  React.useEffect(() => {
    if (!pid && practicals.data?.length) {
      const p = practicals.data.find((x) => x.code === "PR-CLF-01") ?? practicals.data[0];
      setPid(String(p.id));
    }
  }, [practicals.data, pid]);
  const roster = useApi<{ practical: Practical; rows: { learner_id: number; learner: string; learner_code: string; batch: string | null; submission: Submission | null }[] }>(
    pid ? `/practicals/${pid}/roster` : null,
  );
  const [evalFor, setEvalFor] = React.useState<{ learner_id: number; learner: string; submission: Submission | null } | null>(null);
  const [status, setStatus] = React.useState("Evaluated");
  const [rubric, setRubric] = React.useState<Record<string, string>>({});
  const [remarks, setRemarks] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const p = roster.data?.practical;

  const openEval = (r: { learner_id: number; learner: string; submission: Submission | null }) => {
    setEvalFor(r);
    setStatus(r.submission?.status === "Evaluated" ? "Evaluated" : "Evaluated");
    setRemarks(r.submission?.remarks ?? "");
    setRubric(Object.fromEntries((p?.rubric?.criteria ?? []).map((c) => [c.name, String(r.submission?.rubric_scores?.[c.name] ?? "")])));
  };
  const total = (p?.rubric?.criteria ?? []).reduce((s, c) => s + (Number(rubric[c.name]) || 0), 0);
  const submit = async () => {
    if (!evalFor || !p) return;
    setBusy(true);
    try {
      const body: Record<string, unknown> = { status, remarks: remarks || null };
      if (status === "Evaluated" && p.rubric) body.rubric_scores = Object.fromEntries(Object.entries(rubric).map(([k, v]) => [k, Number(v) || 0]));
      await api(`/practicals/${p.id}/submissions/${evalFor.learner_id}`, { method: "PUT", body });
      toast.success("Practical updated", `${evalFor.learner}: ${status}${status === "Evaluated" ? ` · ${total}/${p.rubric?.total_score ?? 100}` : ""}`);
      setEvalFor(null);
      roster.reload();
    } catch (e) {
      toast.error("Not saved", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardBody className="flex flex-wrap items-end gap-3">
          <Field label="Practical" htmlFor="p-sel" className="w-[420px] max-w-full">
            <Select id="p-sel" value={pid} onChange={(e) => setPid(e.target.value)}>
              {(practicals.data ?? []).map((x) => <option key={x.id} value={x.id}>{x.code} · {x.title} ({x.course})</option>)}
            </Select>
          </Field>
        </CardBody>
      </Card>
      {p && (
        <div className="grid gap-4 xl:grid-cols-[1fr_1.2fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader title={p.title} icon={<FlaskConical className="h-4 w-4 text-muted" />} description={`${p.course}${p.module ? ` · ${p.module}` : ""} · ~${p.estimated_minutes} min`} />
              <CardBody className="space-y-3 text-[13px]">
                <div><p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Scenario</p><p>{p.scenario}</p></div>
                <div><p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Objective</p><p>{p.objective}</p></div>
                <div>
                  <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Instructions</p>
                  <ol className="list-decimal space-y-0.5 pl-5">{p.instructions.map((s) => <li key={s}>{s}</li>)}</ol>
                </div>
                {p.tools && <p className="text-[12.5px] text-muted">Tools: {p.tools}</p>}
              </CardBody>
            </Card>
            {p.rubric && <RubricCard r={p.rubric} />}
          </div>
          <Card>
            <CardHeader title="Submissions" description="Submission status, score, remarks and completion per learner." />
            <DataTable
              data={roster.data?.rows ?? []}
              searchable={false}
              dense
              emptyTitle="No onboarded learners for this course."
              columns={[
                { accessorKey: "learner", header: "Learner", cell: ({ row }) => <div><p className="font-medium">{row.original.learner}</p><p className="text-[11.5px] text-muted">{row.original.batch}</p></div> },
                { id: "st", header: "Status", accessorFn: (r) => r.submission?.status ?? "Not Started", cell: ({ row }) => <StatusBadge status={row.original.submission?.status ?? "Not Started"} /> },
                { id: "sc", header: "Score", cell: ({ row }) => <span className="tabular">{row.original.submission?.score ?? "—"}{row.original.submission?.score !== null && row.original.submission ? `/${row.original.submission.max_score}` : ""}</span> },
                { id: "done", header: "Completion", cell: ({ row }) => (row.original.submission?.completed ? <Badge tone="ok">Complete</Badge> : <Badge tone="neutral">Open</Badge>) },
                ...(role === "ADMIN"
                  ? [{ id: "act", header: "", cell: ({ row }: { row: { original: { learner_id: number; learner: string; submission: Submission | null } } }) => <Button size="xs" variant="outline" onClick={() => openEval(row.original)}>Evaluate</Button> }]
                  : []),
              ]}
            />
          </Card>
        </div>
      )}
      <Dialog
        open={!!evalFor}
        onOpenChange={(o) => !o && setEvalFor(null)}
        title={`Evaluate practical — ${evalFor?.learner ?? ""}`}
        description={p?.rubric ? `Score using “${p.rubric.title}” (total ${p.rubric.total_score}).` : undefined}
        footer={<><Button variant="outline" onClick={() => setEvalFor(null)}>Cancel</Button><Button variant="primary" loading={busy} onClick={submit}>Save evaluation</Button></>}
      >
        <div className="space-y-3">
          <Field label="Submission status" htmlFor="ev-st">
            <Select id="ev-st" value={status} onChange={(e) => setStatus(e.target.value)}>
              {["Not Started", "In Progress", "Submitted", "Evaluated"].map((s) => <option key={s}>{s}</option>)}
            </Select>
          </Field>
          {status === "Evaluated" && p?.rubric && (
            <table className="w-full text-[13px]">
              <tbody>
                {p.rubric.criteria.map((c) => (
                  <tr key={c.name} className="border-b border-line/70">
                    <td className="py-1.5 pr-2">{c.name}</td>
                    <td className="w-28 py-1.5">
                      <Input
                        type="number"
                        min={0}
                        max={c.max_score}
                        value={rubric[c.name] ?? ""}
                        onChange={(e) => setRubric((r) => ({ ...r, [c.name]: e.target.value }))}
                        aria-label={`${c.name} score out of ${c.max_score}`}
                        className="h-8"
                      />
                    </td>
                    <td className="tabular w-14 py-1.5 pl-2 text-muted">/ {c.max_score}</td>
                  </tr>
                ))}
                <tr>
                  <td className="py-2 font-semibold">Total</td>
                  <td className="tabular py-2 font-semibold" colSpan={2}>{total} / {p.rubric.total_score}</td>
                </tr>
              </tbody>
            </table>
          )}
          <Field label="Remarks" htmlFor="ev-rem"><Textarea id="ev-rem" value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        </div>
      </Dialog>
    </div>
  );
}

function DefinitionsTab() {
  const { data, loading } = useApi<AssessmentDef[]>("/assessments");
  if (loading && !data) return <LoadingBlock />;
  return (
    <Card>
      <DataTable
        data={data ?? []}
        searchPlaceholder="Search assessments…"
        columns={[
          { accessorKey: "code", header: "Code", cell: ({ row }) => <span className="font-mono text-[12px]">{row.original.code}</span> },
          { accessorKey: "title", header: "Title" },
          { accessorKey: "type", header: "Type", cell: ({ row }) => <Badge tone="info">{row.original.type}</Badge> },
          { accessorKey: "course", header: "Course" },
          { accessorKey: "module", header: "Module", cell: ({ row }) => row.original.module ?? "Course-level" },
          { accessorKey: "max_score", header: "Max" },
          { accessorKey: "pass_percentage", header: "Pass %" },
          { id: "rub", header: "Rubric", cell: ({ row }) => row.original.rubric?.title ?? "—" },
          { id: "key", header: "Answer key", cell: ({ row }) => (row.original.has_answer_key ? "Yes" : "Rubric-based") },
        ]}
      />
    </Card>
  );
}

export function AssessmentsPage({ role }: { role: Role }) {
  return (
    <>
      <PageHeader
        title="Assessments"
        description="Quiz, practical, assignment and final assessments with pass/fail, evaluator and remarks."
        breadcrumbs={[{ label: role === "ADMIN" ? "Administrator" : "Department" }, { label: "Assessments" }]}
      />
      <Tabs defaultValue={role === "ADMIN" ? "record" : "results"}>
        <TabsList>
          {role === "ADMIN" && <TabsTrigger value="record">Record score</TabsTrigger>}
          <TabsTrigger value="results">Results</TabsTrigger>
          <TabsTrigger value="practicals">Practicals</TabsTrigger>
          {role === "ADMIN" && <TabsTrigger value="definitions">Assessment definitions</TabsTrigger>}
        </TabsList>
        {role === "ADMIN" && <TabsContent value="record"><RecordTab /></TabsContent>}
        <TabsContent value="results"><ResultsTab role={role} /></TabsContent>
        <TabsContent value="practicals"><PracticalsTab role={role} /></TabsContent>
        {role === "ADMIN" && <TabsContent value="definitions"><DefinitionsTab /></TabsContent>}
      </Tabs>
    </>
  );
}
