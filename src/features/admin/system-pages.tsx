"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, CircleDot, ExternalLink, RotateCcw, Save } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { cn, fmtDateTime, timeAgo } from "@/lib/utils";
import type { NotificationItem, Role } from "@/types/api";

/* ---------------- Notifications ---------------- */
export function NotificationsPage({ role }: { role: Role }) {
  const router = useRouter();
  const { refresh } = useAuth();
  const [unreadOnly, setUnreadOnly] = React.useState(false);
  const { data, error, loading, reload } = useApi<{ items: NotificationItem[]; unread: number }>("/notifications", { unread_only: unreadOnly });
  const sev: Record<string, string> = { success: "bg-ok", warning: "bg-saffron", critical: "bg-bad", info: "bg-brand-600" };

  const open = async (n: NotificationItem) => {
    if (!n.is_read) {
      await api(`/notifications/${n.id}/read`, { method: "POST" }).catch(() => undefined);
      refresh();
    }
    if (n.link) router.push(n.link);
    else reload();
  };
  const readAll = async () => {
    await api("/notifications/read-all", { method: "POST" });
    reload();
    refresh();
  };

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Local in-app notifications (no external email or SMS service is used in this prototype)."
        breadcrumbs={[{ label: role === "ADMIN" ? "Administrator" : role === "DEPARTMENT" ? "Department" : "Learner" }, { label: "Notifications" }]}
        actions={
          <>
            <Checkbox checked={unreadOnly} onChange={setUnreadOnly} label="Unread only" />
            <Button variant="outline" onClick={readAll} disabled={!data?.unread}><CheckCheck /> Mark all read</Button>
          </>
        }
      />
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : !data?.items.length ? (
          <EmptyState title="No notifications" icon={<Bell className="h-5 w-5" />} />
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((n) => (
              <li key={n.id}>
                <button onClick={() => open(n)} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-canvas", !n.is_read && "bg-brand-50/50")}>
                  <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", sev[n.severity] ?? "bg-brand-600", n.is_read && "opacity-30")} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={cn("text-[13px]", !n.is_read ? "font-semibold" : "font-medium")}>{n.title}</span>
                      <Badge tone="neutral">{n.category}</Badge>
                      {!n.is_read && <span className="sr-only">Unread</span>}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] text-muted">{n.message}</span>
                  </span>
                  <span className="shrink-0 text-[11.5px] text-muted" title={fmtDateTime(n.created_at)}>{timeAgo(n.created_at)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

/* ---------------- Requirement coverage ---------------- */
export function CoveragePage() {
  const { data, loading } = useApi<{ requirement: string; status: string; notes: string }[]>("/coverage");
  const counts = (data ?? []).reduce<Record<string, number>>((a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }), {});
  return (
    <>
      <PageHeader
        title="Requirement Coverage"
        description="Honest implementation status of the prototype against programme requirements."
        breadcrumbs={[{ label: "Administrator" }, { label: "Requirement Coverage" }]}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(counts).map(([s, c]) => (
          <span key={s} className="rounded-md border border-line bg-white px-3 py-1.5 text-[12.5px]">
            <StatusBadge status={s} /> <b className="tabular ml-1">{c}</b>
          </span>
        ))}
      </div>
      <Card>
        {loading && !data ? <LoadingBlock rows={12} /> : (
          <div className="scroll-thin overflow-x-auto">
          <table className="w-full text-[13px]">
            <caption className="sr-only">Requirement coverage</caption>
            <thead>
              <tr className="border-b border-line bg-[#f7f9fb] text-left text-[11.5px] uppercase tracking-wide text-muted">
                <th scope="col" className="px-4 py-2">Requirement</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {(data ?? []).map((r) => (
                <tr key={r.requirement} className="border-b border-line/70">
                  <td className="px-4 py-2 font-medium">
                    <span className="inline-flex items-center gap-2">
                      {r.status === "Implemented" ? <CheckCircle2 className="h-4 w-4 text-ok" /> : r.status.startsWith("Pending") ? <CircleDot className="h-4 w-4 text-subtle" /> : <AlertTriangle className="h-4 w-4 text-warn" />}
                      {r.requirement}
                    </span>
                  </td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 text-muted">{r.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </>
  );
}

/* ---------------- Settings ---------------- */
interface SettingsData {
  eligibility_rules: { value: { code: string; label: string; enabled: boolean; severity: string }[]; description: string };
  risk_thresholds: { value: Record<string, number>; description: string };
  completion_rules: { value: Record<string, number | boolean>; description: string };
  programme: { value: Record<string, unknown>; description: string };
}

const RISK_LABELS: Record<string, string> = {
  on_track_progress: "On-track progress (% of schedule)",
  at_risk_progress: "At-risk below progress (% of schedule)",
  at_risk_attendance: "At-risk below attendance %",
  at_risk_score: "At-risk below average score %",
  inactivity_days: "At-risk after days without activity",
  critical_attendance: "Critical below attendance %",
  critical_failed_assessments: "Critical at failed assessments",
};

export function SettingsPage() {
  const toast = useToast();
  const { data, error, loading, reload } = useApi<SettingsData>("/settings");
  const [rules, setRules] = React.useState<SettingsData["eligibility_rules"]["value"]>([]);
  const [risk, setRisk] = React.useState<Record<string, number>>({});
  const [comp, setComp] = React.useState<Record<string, number | boolean>>({});
  const [busy, setBusy] = React.useState<string | null>(null);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [resetDone, setResetDone] = React.useState<Record<string, number> | null>(null);

  React.useEffect(() => {
    if (data) {
      setRules(data.eligibility_rules.value);
      setRisk(data.risk_thresholds.value);
      setComp(data.completion_rules.value);
    }
  }, [data]);

  const save = async (key: string, value: unknown) => {
    setBusy(key);
    try {
      await api(`/settings/${key}`, { method: "PUT", body: { value } });
      toast.success("Settings saved", key === "eligibility_rules" ? "Eligibility rules updated" : "Progress & completion recomputed for all learners");
      reload();
    } catch (e) {
      toast.error("Not saved", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  const reset = async () => {
    setBusy("reset");
    try {
      const r = await api<{ summary: Record<string, number> }>("/admin/reset-demo", { method: "POST" });
      setResetDone(r.summary);
      setConfirmReset(false);
      toast.success("Demo data restored", "The database has been reset to its initial demonstration state.");
    } catch (e) {
      toast.error("Reset failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data) return <LoadingBlock rows={10} />;

  return (
    <>
      <PageHeader title="Settings" description="Programme configuration (demo rules) and demonstration controls." breadcrumbs={[{ label: "Administrator" }, { label: "Settings" }]} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            title="Eligibility rules"
            description="Demo Eligibility Rules — final rules to be configured according to official programme requirements."
            actions={<Button size="sm" variant="primary" loading={busy === "eligibility_rules"} onClick={() => save("eligibility_rules", rules)}><Save /> Save</Button>}
          />
          <CardBody>
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left text-[11.5px] uppercase text-muted">
                  <th className="pb-2">Rule</th>
                  <th className="pb-2">Enabled</th>
                  <th className="pb-2">If not met</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r, i) => (
                  <tr key={r.code} className="border-t border-line">
                    <td className="py-2 pr-2">{r.label}</td>
                    <td className="py-2">
                      <Checkbox checked={r.enabled} onChange={(v) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, enabled: v } : x)))} label={<span className="sr-only">Enable {r.label}</span>} />
                    </td>
                    <td className="py-2">
                      <Select value={r.severity} onChange={(e) => setRules((rs) => rs.map((x, j) => (j === i ? { ...x, severity: e.target.value } : x)))} className="h-8 w-40" aria-label={`Severity for ${r.label}`}>
                        <option value="FAIL">✕ Not eligible</option>
                        <option value="WARN">⚠ Review required</option>
                      </Select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="At-risk thresholds"
              description="Saving recomputes risk for every learner."
              actions={<Button size="sm" variant="primary" loading={busy === "risk_thresholds"} onClick={() => save("risk_thresholds", risk)}><Save /> Save</Button>}
            />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              {Object.entries(risk).map(([k, v]) => (
                <Field key={k} label={RISK_LABELS[k] ?? k} htmlFor={`r-${k}`}>
                  <Input id={`r-${k}`} type="number" value={v} onChange={(e) => setRisk((s) => ({ ...s, [k]: Number(e.target.value) }))} />
                </Field>
              ))}
            </CardBody>
          </Card>
          <Card>
            <CardHeader
              title="Completion criteria"
              actions={<Button size="sm" variant="primary" loading={busy === "completion_rules"} onClick={() => save("completion_rules", comp)}><Save /> Save</Button>}
            />
            <CardBody className="space-y-2">
              <Checkbox checked={!!comp.require_all_modules} onChange={(v) => setComp({ ...comp, require_all_modules: v })} label="All required modules complete" />
              <Checkbox checked={!!comp.require_all_assessments_passed} onChange={(v) => setComp({ ...comp, require_all_assessments_passed: v })} label="All assessments passed" />
              <Checkbox checked={!!comp.require_all_practicals} onChange={(v) => setComp({ ...comp, require_all_practicals: v })} label="All practicals completed" />
              <Field label="Minimum attendance %" htmlFor="c-att" className="w-48">
                <Input id="c-att" type="number" value={comp.min_attendance === undefined ? "" : Number(comp.min_attendance)} onChange={(e) => setComp({ ...comp, min_attendance: Number(e.target.value) })} />
              </Field>
            </CardBody>
          </Card>
        </div>
      </div>
      <Card className="mt-4 border-[#f5c6c1]">
        <CardHeader title="Reset Demo Data" description="Restores the initial demonstration dataset. All records created during a demonstration are removed." icon={<RotateCcw className="h-4 w-4 text-bad" />} />
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">Use before or after a live presentation. Your session stays signed in.</p>
          <Button variant="danger" onClick={() => setConfirmReset(true)}><RotateCcw /> Reset Demo Data</Button>
        </CardBody>
        {resetDone && (
          <CardBody className="pt-0">
            <Alert tone="ok" title="Demo data restored">
              {Object.entries(resetDone).map(([k, v]) => `${k.replaceAll("_", " ")}: ${v}`).join(" · ")}
            </Alert>
          </CardBody>
        )}
      </Card>
      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        size="sm"
        title="Reset all demo data?"
        description="This deletes every record and reloads the initial sample dataset. This cannot be undone."
        footer={<><Button variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Button><Button variant="danger" loading={busy === "reset"} onClick={reset}>Yes, reset</Button></>}
      >
        <p className="text-[13px]">Demo accounts and passwords remain the same after the reset.</p>
      </Dialog>
    </>
  );
}

/* ---------------- Demo guide ---------------- */
const STEPS: { title: string; who: "Department" | "Admin" | "Learner"; detail: string; href?: string }[] = [
  { who: "Department", title: "Login as Department In-Charge", detail: "Sign out and sign in as department@nielit-demo.local (State Cyber Investigation Bureau)." },
  { who: "Department", title: "Create learner nomination", detail: "Nominations → New nomination → New learner. Use qualification “Graduate (Engineering/IT)”, course Cloud Forensics.", href: "/department/nominations?new=1" },
  { who: "Department", title: "Submit nomination", detail: "Click “Create & submit” (or open the draft and press Submit nomination). NIELIT administrators are notified." },
  { who: "Admin", title: "Login as Administrator", detail: "Sign in as admin@nielit-demo.local. The Pending Nominations KPI includes the new nomination." },
  { who: "Admin", title: "Review nomination", detail: "Nominations → Pending review → open the new nomination → Start review.", href: "/admin/nominations" },
  { who: "Admin", title: "Run eligibility", detail: "Run eligibility check — each demo rule shows ✓ / ⚠ / ✕ with its reason." },
  { who: "Admin", title: "Approve learner", detail: "Approve (remarks optional when fully eligible). The department is notified." },
  { who: "Admin", title: "Allocate course", detail: "Allocate course → Cloud Forensics. A course enrolment, progress and completion record are created." },
  { who: "Admin", title: "Allocate batch", detail: "Assign batch → CLOUD-FORENSICS-2026-01 (active) to continue with attendance today." },
  { who: "Admin", title: "Onboard learner", detail: "Onboard learner — creates the learner's portal account and a demo NDU enrolment reference." },
  { who: "Admin", title: "Open course", detail: "Courses → Cloud Forensics.", href: "/admin/courses" },
  { who: "Admin", title: "Show Course → Module → Lesson → Video → Practical → Assessment", detail: "Expand “AWS CloudTrail” to show the lesson, VID-007 video record, practical PR-CLF-01 with rubric, and assessments. Open VID-007 to show metadata, QC and the player placeholder." },
  { who: "Admin", title: "Record attendance", detail: "Attendance → CLOUD-FORENSICS-2026-01 → today → Mark All Present → Save Attendance.", href: "/admin/attendance" },
  { who: "Admin", title: "Enter assessment", detail: "Assessments → Record score → Cloud Forensics → Practical Assessment → choose the learner → 86 / 100 → Save score.", href: "/admin/assessments" },
  { who: "Admin", title: "Show progress", detail: "Progress → see overall progress, expected progress, modules, practicals, assessments, attendance.", href: "/admin/progress" },
  { who: "Admin", title: "Show at-risk logic", detail: "Progress → At-risk learners tab — each flag lists its reason. Rules tab shows the demo thresholds." },
  { who: "Admin", title: "Simulate NDU update", detail: "NDU Integration → select Arjun Mehta → Simulate NDU Update → progress changes and the sync log stores old/new values.", href: "/admin/ndu" },
  { who: "Admin", title: "Generate report", detail: "Reports → Progress Report → Generate Report → Export Excel / PDF.", href: "/admin/reports" },
  { who: "Admin", title: "Open audit trail", detail: "Audit Trail — every step above is recorded with user, role, entity and result.", href: "/admin/audit" },
];

export function DemoGuidePage() {
  const [done, setDone] = React.useState<number[]>([]);
  React.useEffect(() => {
    try {
      setDone(JSON.parse(window.localStorage.getItem("nielit_demo_guide") ?? "[]"));
    } catch {
      /* ignore */
    }
  }, []);
  const toggle = (i: number) =>
    setDone((d) => {
      const n = d.includes(i) ? d.filter((x) => x !== i) : [...d, i];
      try {
        window.localStorage.setItem("nielit_demo_guide", JSON.stringify(n));
      } catch {
        /* ignore */
      }
      return n;
    });
  return (
    <>
      <PageHeader
        title="Live Demo Guide"
        description="End-to-end walkthrough of the programme workflow. Everything works without editing the database."
        breadcrumbs={[{ label: "Administrator" }, { label: "Demo Guide" }]}
        actions={<Button variant="outline" onClick={() => { setDone([]); try { window.localStorage.removeItem("nielit_demo_guide"); } catch { /* ignore */ } }}>Clear checklist</Button>}
      />
      <Alert tone="info" className="mb-4" title="Before presenting">
        Settings → Reset Demo Data restores the initial state. Demo passwords are in the setup guide (README). Learner account for the learner view: learner@nielit-demo.local.
      </Alert>
      <Card>
        <ol className="divide-y divide-line">
          {STEPS.map((s, i) => (
            <li key={i} className={cn("flex items-start gap-4 px-4 py-3", done.includes(i) && "bg-ok-bg/40")}>
              <button
                onClick={() => toggle(i)}
                className={cn(
                  "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[12px] font-semibold",
                  done.includes(i) ? "border-ok bg-ok text-white" : "border-line bg-white text-navy-900",
                )}
                aria-label={`Step ${i + 1}: mark ${done.includes(i) ? "not done" : "done"}`}
                aria-pressed={done.includes(i)}
              >
                {done.includes(i) ? "✓" : i + 1}
              </button>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink">
                  Step {i + 1} · {s.title}
                  <Badge tone={s.who === "Admin" ? "navy" : s.who === "Department" ? "info" : "neutral"}>{s.who}</Badge>
                </p>
                <p className="mt-0.5 text-[12.5px] text-muted">{s.detail}</p>
              </div>
              {s.href && (
                <Link href={s.href} className="inline-flex shrink-0 items-center gap-1 text-[12.5px] text-brand-600 hover:underline">
                  Open <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
