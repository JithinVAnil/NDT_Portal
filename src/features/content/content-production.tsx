"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, Clapperboard, ClipboardCheck, FileText, FlaskConical, PencilRuler, Ruler, Subtitles, Timer, Video } from "lucide-react";
import { api } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { KpiCard, KpiGrid } from "@/components/kpi";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorState, KpiSkeleton, LoadingBlock, ProgressBar } from "@/components/ui/states";
import { SimpleBar, STATUS } from "@/components/charts/charts";
import { Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { cn, pct } from "@/lib/utils";
import type { ContentItem, ContentSummary } from "@/types/api";

export function ContentProductionPage() {
  const toast = useToast();
  const summary = useApi<ContentSummary>("/content/summary");
  const items = useApi<ContentItem[]>("/content", { content_type: "Video" });
  const stages = useApi<{ production_stages: string[] }>("/content/meta");
  const s = summary.data;

  const move = async (c: ContentItem, stage: string) => {
    try {
      await api(`/content/${c.id}/production-status`, { method: "PATCH", body: { production_status: stage } });
      toast.success("Production status updated", `${c.code} → ${stage}`);
      items.reload();
      summary.reload();
    } catch (e) {
      toast.error("Update failed", e instanceof Error ? e.message : undefined);
    }
  };

  return (
    <>
      <PageHeader
        title="Content Production"
        description="Tracking of the instructional-video production pipeline against the 25.5-hour recorded content target. Figures are calculated from stored video durations."
        breadcrumbs={[{ label: "Administrator" }, { label: "Content Production" }]}
      />
      {summary.error && <ErrorState message={summary.error} onRetry={summary.reload} />}
      {!s ? (
        <KpiSkeleton count={10} />
      ) : (
        <div className="space-y-5">
          <Card>
            <CardBody className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">Content produced</p>
                <p className="tabular mt-1 text-[34px] font-semibold leading-none text-navy-900">
                  {s.total_hours.toFixed(1)} <span className="text-[18px] font-normal text-muted">/ {s.target_hours} hours</span>
                </p>
                <ProgressBar value={s.produced_pct} tone="brand" className="mt-3 h-3" label="Content produced vs 25.5-hour target" />
                <p className="mt-2 text-[12.5px] text-muted">
                  {pct(s.produced_pct, 1)} of target · {s.total_minutes} recorded minutes across {s.total_videos} demo video records ·{" "}
                  {s.ready_hours.toFixed(2)} h QC-ready
                </p>
              </div>
              <div className="space-y-2">
                {s.by_course.map((c) => (
                  <div key={c.code}>
                    <div className="mb-0.5 flex justify-between text-[12.5px]">
                      <span>{c.course}</span>
                      <span className="tabular text-muted">
                        {c.hours.toFixed(2)} / {c.target_hours} h · {c.videos} videos
                      </span>
                    </div>
                    <ProgressBar value={(100 * c.hours) / (c.target_hours || 1)} tone="brand" size="sm" label={`${c.course} hours`} />
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          <KpiGrid>
            <KpiCard label="Total Videos" value={s.total_videos} icon={Video} />
            <KpiCard label="Total Video Hours" value={s.total_hours.toFixed(2)} sub={`Target ${s.target_hours} h`} icon={Timer} />
            <KpiCard label="Videos Ready" value={s.videos_ready} icon={CheckCircle2} tone="ok" />
            <KpiCard label="Videos Pending" value={s.videos_pending} sub={`${s.videos_needs_review} need review`} icon={Clapperboard} tone="warn" />
            <KpiCard label="Pending QC" value={s.videos_pending_qc} icon={ClipboardCheck} href="/admin/content-qc" />
            <KpiCard label="Missing Captions" value={s.missing_captions} sub="SRT / VTT" icon={Subtitles} tone={s.missing_captions ? "warn" : "ok"} />
            <KpiCard label="Missing Transcripts" value={s.missing_transcripts} sub="DOCX / accessible PDF" icon={FileText} tone={s.missing_transcripts ? "warn" : "ok"} />
            <KpiCard label="Practicals" value={s.practicals} icon={FlaskConical} />
            <KpiCard label="Exercises" value={s.exercises} icon={PencilRuler} />
            <KpiCard label="Assessments · Rubrics" value={`${s.assessments} · ${s.rubrics}`} icon={Ruler} />
          </KpiGrid>

          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Videos by production stage" />
              <CardBody>
                <SimpleBar data={s.by_stage} x="stage" y="count" name="Videos" horizontal height={300} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="QC status" />
              <CardBody className="space-y-3">
                {s.by_status.map((b) => {
                  const color = { Ready: STATUS.ok, "Pending QC": STATUS.warn, "Pending Assets": STATUS.neutral, "Needs Review": STATUS.bad }[b.status];
                  return (
                    <div key={b.status}>
                      <div className="mb-1 flex justify-between text-[12.5px]">
                        <StatusBadge status={b.status} />
                        <span className="tabular font-semibold">{b.count}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[#e6eaf0]">
                        <div className="h-full rounded-full" style={{ width: `${(100 * b.count) / (s.total_videos || 1)}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          </div>
        </div>
      )}

      <Card className="mt-5">
        <CardHeader title="Production tracker" description="Idea → Script Ready → Recording Pending → Editing → QC → Captions Pending → Transcript Pending → Approved → Ready for Upload" />
        {items.loading && !items.data ? (
          <LoadingBlock />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-line bg-[#f7f9fb] text-left text-[11.5px] uppercase tracking-wide text-muted">
                  <th className="px-4 py-2">Video</th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Minutes</th>
                  <th className="px-3 py-2">Pipeline</th>
                  <th className="px-3 py-2">Stage</th>
                  <th className="px-3 py-2">QC</th>
                </tr>
              </thead>
              <tbody>
                {(items.data ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-line/70">
                    <td className="px-4 py-2">
                      <Link href={`/admin/content/${c.id}`} className="font-medium text-brand-600 hover:underline">{c.code}</Link>
                      <p className="text-[12px] text-muted">{c.title}</p>
                    </td>
                    <td className="px-3 py-2">{c.course_code}</td>
                    <td className="tabular px-3 py-2">{c.duration_minutes}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-0.5" aria-label={`Stage ${c.production_stage_index + 1} of 9`}>
                        {Array.from({ length: 9 }).map((_, i) => (
                          <span key={i} className={cn("h-2 w-4 rounded-sm", i <= c.production_stage_index ? "bg-brand-600" : "bg-[#e1e6ee]")} />
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Select
                        value={c.production_status}
                        onChange={(e) => move(c, e.target.value)}
                        className="h-8 w-44"
                        aria-label={`Production stage for ${c.code}`}
                      >
                        {(stages.data?.production_stages ?? [c.production_status]).map((st) => <option key={st}>{st}</option>)}
                      </Select>
                    </td>
                    <td className="px-3 py-2"><StatusBadge status={c.overall_status} /></td>
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

const QC_COLS: [string, string][] = [
  ["qc_original_content", "Original"],
  ["qc_human_review", "Human review"],
  ["qc_srt", "SRT"],
  ["qc_vtt", "VTT"],
  ["qc_docx", "DOCX"],
  ["qc_pdf", "PDF"],
  ["qc_audio", "Audio QC"],
  ["qc_technical", "Technical QC"],
  ["qc_ai_disclosure", "AI disclosure"],
];

export function ContentQcPage() {
  const router = useRouter();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<ContentItem[]>("/content", { content_type: "Video" });
  const [busy, setBusy] = React.useState<string | null>(null);

  const toggle = async (c: ContentItem, key: string) => {
    setBusy(`${c.id}-${key}`);
    try {
      const res = await api<ContentItem>(`/content/${c.id}/qc`, { method: "PATCH", body: { [key]: !c.qc[key] } });
      setData((prev) => (prev ?? []).map((x) => (x.id === c.id ? res : x)));
      if (res.overall_status === "Ready" && c.overall_status !== "Ready") toast.success("Content QC completed", `${res.code} is now Ready`);
    } catch (e) {
      toast.error("QC update failed", e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Content QC"
        description="Quality-control matrix for every instructional video. Click a cell to toggle ✓ / Pending. Restriction compliance is managed on each video's page."
        breadcrumbs={[{ label: "Administrator" }, { label: "Content QC" }]}
      />
      <Card>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">Content QC matrix</caption>
              <thead>
                <tr className="border-b border-line bg-[#f7f9fb] text-left text-[11px] uppercase tracking-wide text-muted">
                  <th scope="col" className="px-4 py-2">Video</th>
                  {QC_COLS.map(([k, l]) => <th key={k} scope="col" className="px-2 py-2 text-center">{l}</th>)}
                  <th scope="col" className="px-3 py-2">Overall</th>
                </tr>
              </thead>
              <tbody>
                {(data ?? []).map((c) => (
                  <tr key={c.id} className="border-b border-line/70 hover:bg-brand-50/40">
                    <td className="px-4 py-2">
                      <button className="text-left" onClick={() => router.push(`/admin/content/${c.id}`)}>
                        <span className="font-mono text-[12px] font-semibold text-brand-600">{c.code}</span>
                        <span className="block max-w-[220px] truncate text-[12px] text-muted">{c.title}</span>
                      </button>
                    </td>
                    {QC_COLS.map(([k, l]) => {
                      const ok = c.qc[k];
                      return (
                        <td key={k} className="px-1 py-1 text-center">
                          <button
                            onClick={() => toggle(c, k)}
                            disabled={busy === `${c.id}-${k}`}
                            className={cn(
                              "inline-flex h-7 min-w-[64px] items-center justify-center gap-1 rounded border text-[11.5px] font-medium",
                              ok ? "border-[#bfe3cf] bg-ok-bg text-ok" : "border-[#f2d9a6] bg-warn-bg text-warn",
                            )}
                            aria-label={`${l} for ${c.code}: ${ok ? "done" : "pending"}. Toggle`}
                            aria-pressed={ok}
                          >
                            {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
                            {ok ? "✓" : "Pending"}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2"><StatusBadge status={c.overall_status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <p className="mt-2 text-[12px] text-muted">
        Overall status: <b>Ready</b> = all QC checks, captions/transcripts and restriction compliance confirmed · <b>Pending Assets</b> = captions or transcripts missing ·{" "}
        <b>Pending QC</b> = assets present, QC checks outstanding · <b>Needs Review</b> = flagged by reviewer.
      </p>
    </>
  );
}
