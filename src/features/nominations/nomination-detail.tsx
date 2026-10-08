"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  CircleDashed,
  ClipboardCheck,
  Layers,
  Send,
  ShieldCheck,
  UserCheck,
  XCircle,
  AlertTriangle,
  Search,
} from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert, ErrorState, KeyValue, LoadingBlock } from "@/components/ui/states";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn, fmtDate, fmtDateTime } from "@/lib/utils";
import type { NominationDetail, Role } from "@/types/api";

const FLOW = [
  { key: "Submitted", label: "Submitted", icon: Send },
  { key: "Under Review", label: "Under review", icon: Search },
  { key: "Eligibility", label: "Eligibility", icon: ShieldCheck },
  { key: "Approved", label: "Approved", icon: CheckCircle2 },
  { key: "Course", label: "Course allocated", icon: BookOpen },
  { key: "Batch", label: "Batch allocated", icon: Layers },
  { key: "Onboarded", label: "Onboarded", icon: UserCheck },
];

function stageIndex(n: NominationDetail): number {
  switch (n.status) {
    case "Draft":
      return -1;
    case "Submitted":
      return 0;
    case "Under Review":
      return n.eligibility_result ? 2 : 1;
    case "Eligible":
    case "Ineligible":
      return 2;
    case "Approved":
      return 3;
    case "Allocated":
      return n.allocated_batch_id ? 5 : 4;
    case "Onboarded":
      return 6;
    case "Rejected":
      return n.eligibility_result ? 2 : 1;
    default:
      return 0;
  }
}

function Stepper({ n }: { n: NominationDetail }) {
  const idx = stageIndex(n);
  const rejected = n.status === "Rejected";
  const ineligible = n.status === "Ineligible";
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" aria-label="Workflow progress">
      {FLOW.map((s, i) => {
        const done = i <= idx;
        const current = i === idx + 1 && !rejected && !ineligible;
        const failed = (rejected || ineligible) && i === idx;
        const Icon = failed ? XCircle : done ? s.icon : CircleDashed;
        return (
          <li
            key={s.key}
            className={cn(
              "flex items-center gap-2 rounded-md border px-2.5 py-2 text-[12px]",
              failed
                ? "border-[#f5c6c1] bg-bad-bg text-bad"
                : done
                  ? "border-[#bfe3cf] bg-ok-bg text-ok"
                  : current
                    ? "border-brand-500 bg-brand-50 text-brand-600"
                    : "border-line bg-white text-muted",
            )}
            aria-current={current ? "step" : undefined}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="font-medium">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function NominationDetailPage({ role }: { role: Role }) {
  const { id } = useParams<{ id: string }>();
  const { refresh: refreshMe } = useAuth();
  const toast = useToast();
  const { data: n, error, loading, reload, setData } = useApi<NominationDetail>(`/nominations/${id}`);
  const courses = useApi<{ id: number; title: string; code: string }[]>(role === "ADMIN" ? "/courses/options" : null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<null | "approve" | "reject">(null);
  const [remarks, setRemarks] = React.useState("");
  const [courseId, setCourseId] = React.useState("");
  const [batchId, setBatchId] = React.useState("");
  const base = role === "ADMIN" ? "/admin" : "/department";

  React.useEffect(() => {
    if (n) {
      setCourseId(String(n.allocated_course_id ?? n.course_id));
      const firstOpen = n.available_batches.find((b) => (b.enrolled ?? 0) < b.capacity);
      setBatchId(firstOpen ? String(firstOpen.id) : "");
    }
  }, [n]);

  const act = async (key: string, path: string, body?: unknown, success?: string) => {
    setBusy(key);
    try {
      const res = await api<NominationDetail>(`/nominations/${id}/${path}`, { method: "POST", body: body ?? {} });
      setData(res);
      setDialog(null);
      setRemarks("");
      if (res.onboarding) {
        toast.success(
          "Learner onboarded",
          `${res.learner.full_name} → ${res.onboarding.batch}. NDU ref ${res.onboarding.ndu_learner_ref} (demo)` +
            (res.onboarding.account_created ? `. Portal account created for ${res.onboarding.account_email}.` : "."),
        );
      } else toast.success(success ?? "Updated", `${res.nomination_no} is now ${res.status}`);
      refreshMe();
    } catch (e) {
      toast.error("Action not completed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !n) return <LoadingBlock rows={10} />;

  const check = n.eligibility_checks[0];
  const isAdmin = role === "ADMIN";
  const s = n.status;

  return (
    <>
      <PageHeader
        title={<span className="font-mono">{n.nomination_no}</span>}
        badge={<StatusBadge status={s} />}
        description={`${n.learner.full_name} · ${n.course} · ${n.training_mode} mode · ${n.department}`}
        breadcrumbs={[
          { label: isAdmin ? "Administrator" : "Department" },
          { label: "Nominations", href: `${base}/nominations` },
          { label: n.nomination_no },
        ]}
      />

      <Card className="mb-4">
        <CardBody>
          <Stepper n={n} />
        </CardBody>
      </Card>

      {/* Next action panel */}
      <Card className="mb-4 border-brand-500/40">
        <CardHeader title="Next action" icon={<ClipboardCheck className="h-4 w-4 text-brand-600" />} />
        <CardBody className="space-y-3">
          {s === "Draft" && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted">This nomination is a draft and has not been sent to NIELIT.</p>
              <Button variant="primary" loading={busy === "submit"} onClick={() => act("submit", "submit", undefined, "Nomination submitted")}>
                <Send /> Submit nomination
              </Button>
            </div>
          )}
          {!isAdmin && s !== "Draft" && (
            <p className="text-[13px] text-muted">
              {s === "Onboarded"
                ? "The learner has been onboarded. Track progress from the Learners page."
                : s === "Rejected" || s === "Ineligible"
                  ? "NIELIT has closed this nomination. See remarks and eligibility reasons below."
                  : "Awaiting NIELIT review, eligibility validation and approval. You will be notified of the decision."}
            </p>
          )}
          {isAdmin && s === "Submitted" && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" loading={busy === "review"} onClick={() => act("review", "review", undefined, "Review started")}>
                <Search /> Start review
              </Button>
              <Button variant="primary" loading={busy === "elig"} onClick={() => act("elig", "eligibility", undefined, "Eligibility checked")}>
                <ShieldCheck /> Run eligibility check
              </Button>
              <Button variant="outline" onClick={() => setDialog("reject")}>
                <XCircle /> Reject
              </Button>
            </div>
          )}
          {isAdmin && ["Under Review", "Eligible", "Ineligible"].includes(s) && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" loading={busy === "elig"} onClick={() => act("elig", "eligibility", undefined, "Eligibility re-checked")}>
                <ShieldCheck /> {n.eligibility_result ? "Re-run eligibility" : "Run eligibility check"}
              </Button>
              {n.eligibility_result && n.eligibility_result !== "NOT_ELIGIBLE" && (
                <Button variant="success" onClick={() => setDialog("approve")}>
                  <CheckCircle2 /> Approve
                </Button>
              )}
              <Button variant="danger" onClick={() => setDialog("reject")}>
                <XCircle /> Reject
              </Button>
            </div>
          )}
          {isAdmin && s === "Approved" && (
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Allocate course" htmlFor="alloc-course" className="w-72">
                <Select id="alloc-course" value={courseId} onChange={(e) => setCourseId(e.target.value)}>
                  {(courses.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>{c.title}</option>
                  ))}
                </Select>
              </Field>
              <Button variant="primary" loading={busy === "course"} onClick={() => act("course", "allocate-course", { course_id: Number(courseId) }, "Course allocated")}>
                <BookOpen /> Allocate course
              </Button>
            </div>
          )}
          {isAdmin && s === "Allocated" && !n.allocated_batch_id && (
            n.available_batches.length === 0 ? (
              <Alert tone="warn">No planned or active batch exists for {n.allocated_course}. Create one under Batches first.</Alert>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <Field label="Assign batch" htmlFor="alloc-batch" className="w-[420px] max-w-full">
                  <Select id="alloc-batch" value={batchId} onChange={(e) => setBatchId(e.target.value)}>
                    {n.available_batches.map((b) => (
                      <option key={b.id} value={b.id} disabled={(b.enrolled ?? 0) >= b.capacity}>
                        {b.code} · {b.mode} · {fmtDate(b.start_date)} · {b.enrolled}/{b.capacity} · {b.status}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Button variant="primary" loading={busy === "batch"} disabled={!batchId} onClick={() => act("batch", "allocate-batch", { batch_id: Number(batchId) }, "Batch allocated")}>
                  <Layers /> Assign batch
                </Button>
              </div>
            )
          )}
          {isAdmin && s === "Allocated" && n.allocated_batch_id && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-[13px] text-muted">
                Onboarding activates the learner in <b>{n.allocated_batch}</b>, creates their portal account and registers a demo NDU enrolment.
              </p>
              <Button variant="primary" loading={busy === "onboard"} onClick={() => act("onboard", "onboard")}>
                <UserCheck /> Onboard learner
              </Button>
            </div>
          )}
          {isAdmin && s === "Onboarded" && (
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <Link href={`/admin/learners/${n.learner.id}`}>Open learner record</Link>
              </Button>
              {n.allocated_batch_id && (
                <Button asChild variant="outline">
                  <Link href={`/admin/batches/${n.allocated_batch_id}`}>Open batch {n.allocated_batch}</Link>
                </Button>
              )}
            </div>
          )}
          {(s === "Rejected") && n.decision_remarks && <Alert tone="bad" title="Rejected">{n.decision_remarks}</Alert>}
        </CardBody>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.2fr_1fr]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Learner" actions={<Badge tone="neutral">{n.learner.learner_code}</Badge>} />
            <CardBody>
              <KeyValue
                cols={3}
                items={[
                  ["Name", n.learner.full_name],
                  ["Employee ID", <span key="e" className="font-mono">{n.learner.employee_id}</span>],
                  ["Email", n.learner.email],
                  ["Mobile", n.learner.mobile],
                  ["Designation", n.learner.designation],
                  ["Qualification", n.learner.qualification],
                  ["Department", `${n.department} (${n.department_code})`],
                  ["Location", n.learner.location],
                  ["Learner status", <StatusBadge key="s" status={n.learner.status} />],
                ]}
              />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Nomination" />
            <CardBody>
              <KeyValue
                cols={3}
                items={[
                  ["Course nominated", n.course],
                  ["Training mode", n.training_mode],
                  ["Allocated course", n.allocated_course],
                  ["Allocated batch", n.allocated_batch],
                  ["Created by", n.created_by],
                  ["Submitted", fmtDateTime(n.submitted_at)],
                  ["Reviewed by", n.reviewed_by],
                  ["Onboarded", fmtDateTime(n.onboarded_at)],
                  ["Decision remarks", n.decision_remarks],
                ]}
              />
              {n.justification && (
                <p className="mt-3 rounded-md bg-canvas px-3 py-2 text-[12.5px] text-muted">
                  <b className="text-ink">Justification: </b>
                  {n.justification}
                </p>
              )}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Eligibility validation"
              actions={check ? <StatusBadge status={check.result} /> : undefined}
              description="Demo Eligibility Rules — final rules to be configured according to official programme requirements."
            />
            <CardBody>
              {!check ? (
                <p className="text-[13px] text-muted">Eligibility has not been checked yet.</p>
              ) : (
                <>
                  <ul className="divide-y divide-line rounded-md border border-line">
                    {check.rules.map((r) => (
                      <li key={r.code} className="flex items-start gap-3 px-3 py-2">
                        {r.outcome === "PASS" ? (
                          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" aria-label="Pass" />
                        ) : r.outcome === "WARN" ? (
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-label="Review required" />
                        ) : (
                          <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-bad" aria-label="Fail" />
                        )}
                        <div>
                          <p className="text-[13px] font-medium">{r.rule}</p>
                          <p className="text-[12.5px] text-muted">{r.message}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11.5px] text-muted">
                    Checked by {check.checked_by} · {fmtDateTime(check.timestamp)}
                    {n.eligibility_checks.length > 1 && ` · ${n.eligibility_checks.length} checks recorded`}
                  </p>
                </>
              )}
            </CardBody>
          </Card>
        </div>
        <Card className="h-fit">
          <CardHeader title="Status history" description="Every workflow transition is stored and audited." />
          <CardBody>
            <ol className="relative space-y-4 border-l border-line pl-5">
              {[...n.history].reverse().map((h) => (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[25px] top-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-600 ring-1 ring-brand-600" aria-hidden />
                  <p className="text-[13px] font-medium">{h.action}</p>
                  <p className="text-[12px] text-muted">
                    {h.from_status ? `${h.from_status} → ` : ""}
                    {h.to_status} · {h.user} · {fmtDateTime(h.timestamp)}
                  </p>
                  {h.remarks && <p className="mt-1 rounded bg-canvas px-2 py-1 text-[12px] text-muted">{h.remarks}</p>}
                </li>
              ))}
            </ol>
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={dialog !== null}
        onOpenChange={(o) => !o && setDialog(null)}
        size="sm"
        title={dialog === "approve" ? "Approve nomination" : "Reject nomination"}
        description={
          dialog === "approve"
            ? n.eligibility_result === "REVIEW_REQUIRED"
              ? "Eligibility requires review — approval remarks are mandatory."
              : "Approval remarks are optional."
            : "A rejection reason is required and will be shared with the department."
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
            {dialog === "approve" ? (
              <Button variant="success" loading={busy === "approve"} onClick={() => act("approve", "approve", { remarks: remarks || null }, "Nomination approved")}>
                Approve
              </Button>
            ) : (
              <Button variant="danger" loading={busy === "reject"} disabled={!remarks.trim()} onClick={() => act("reject", "reject", { remarks }, "Nomination rejected")}>
                Reject
              </Button>
            )}
          </>
        }
      >
        <Field label="Remarks" htmlFor="remarks" required={dialog === "reject" || n.eligibility_result === "REVIEW_REQUIRED"}>
          <Textarea id="remarks" value={remarks} onChange={(e) => setRemarks(e.target.value)} autoFocus />
        </Field>
      </Dialog>
    </>
  );
}
