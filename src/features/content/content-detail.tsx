"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckCircle2, Circle, Save, Upload, XCircle } from "lucide-react";
import { api, uploadBase } from "@/lib/api";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert, ErrorState, KeyValue, LoadingBlock } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { cn, fmtDateTime } from "@/lib/utils";
import type { ContentItem } from "@/types/api";
import { VideoPlayer } from "./video-player";

interface Meta {
  production_stages: string[];
  qc_fields: { key: string; label: string }[];
  restrictions: { key: string; label: string }[];
}

export function ProductionPipeline({ stage, stages }: { stage: string; stages: string[] }) {
  const idx = stages.indexOf(stage);
  return (
    <ol className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-9" aria-label="Production status">
      {stages.map((s, i) => (
        <li
          key={s}
          className={cn(
            "rounded border px-2 py-1.5 text-center text-[11px] font-medium leading-tight",
            i < idx ? "border-[#bfe3cf] bg-ok-bg text-ok" : i === idx ? "border-navy-900 bg-navy-900 text-white" : "border-line text-muted",
          )}
          aria-current={i === idx ? "step" : undefined}
        >
          {s}
        </li>
      ))}
    </ol>
  );
}

export function ContentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { data, error, loading, reload, setData } = useApi<ContentItem>(`/content/${id}`);
  const meta = useApi<Meta>("/content/meta");
  const [form, setForm] = React.useState<Record<string, string | boolean>>({});
  const [saving, setSaving] = React.useState<string | null>(null);
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (data) {
      setForm({
        title: data.title, description: data.description ?? "", instructor: data.instructor ?? "",
        duration_minutes: String(data.duration_minutes), learning_objective: data.learning_objective ?? "",
        is_deep_dive: data.is_deep_dive, resolution: data.resolution ?? "", aspect_ratio: data.aspect_ratio ?? "",
        frame_rate: data.frame_rate ?? "", file_format: data.file_format ?? "", codec: data.codec ?? "",
        audio_sample_rate: data.audio_sample_rate ?? "", ai_used: data.ai_used, ai_tool: data.ai_tool ?? "",
        ai_purpose: data.ai_purpose ?? "", ai_human_reviewer: data.ai_human_reviewer ?? "",
        ai_disclosure_text: data.ai_disclosure_text ?? "",
      });
      setNotes(data.qc_notes ?? "");
    }
  }, [data]);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !data || !meta.data) return <LoadingBlock rows={10} />;
  const c = data;
  const isVideo = c.content_type === "Video";

  const patch = async (key: string, path: string, body: unknown, method = "PATCH", msg = "Saved") => {
    setSaving(key);
    try {
      const res = await api<ContentItem>(`/content/${id}${path}`, { method, body });
      setData(res);
      if (res.overall_status === "Ready" && c.overall_status !== "Ready") toast.success("Content QC completed", `${res.code} is now Ready`);
      else toast.success(msg, `QC status: ${res.overall_status}`);
    } catch (e) {
      toast.error("Not saved", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(null);
    }
  };

  const saveMeta = () => {
    const body: Record<string, unknown> = { ...form, duration_minutes: Number(form.duration_minutes) || 0 };
    Object.keys(body).forEach((k) => {
      if (body[k] === "") body[k] = null;
    });
    if (body.title === null) delete body.title;
    patch("meta", "", body, "PUT", "Metadata saved");
  };

  const upload = async (kind: "video" | "captions", file: File) => {
    setSaving(kind);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api<ContentItem>(`/content/${id}/${kind}`, { form: fd, base: uploadBase() });
      setData(res);
      toast.success(kind === "video" ? "Video uploaded" : "Captions uploaded", file.name);
    } catch (e) {
      toast.error("Upload failed", e instanceof Error ? e.message : undefined);
    } finally {
      setSaving(null);
    }
  };

  const f = (k: string) => ({
    value: String(form[k] ?? ""),
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm((s) => ({ ...s, [k]: e.target.value })),
  });

  return (
    <>
      <PageHeader
        title={<span>{c.code} · {c.title}</span>}
        badge={isVideo ? <StatusBadge status={c.overall_status} /> : <Badge>Resource</Badge>}
        description={`${c.course}${c.module ? ` › M${c.module_sequence}: ${c.module}` : ""}${c.lesson ? ` › ${c.lesson}` : ""}`}
        breadcrumbs={[{ label: "Administrator" }, { label: "Content Library", href: "/admin/content" }, { label: c.code }]}
      />
      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          {isVideo && (
            <Card>
              <CardBody className="space-y-3">
                <VideoPlayer item={c} />
                <div className="flex flex-wrap gap-2">
                  <label className={cn("inline-flex", saving === "video" && "pointer-events-none opacity-60")}>
                    <input type="file" accept=".mp4,.webm,.m4v" className="sr-only" onChange={(e) => e.target.files?.[0] && upload("video", e.target.files[0])} />
                    <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-[12.5px] font-medium hover:bg-canvas">
                      <Upload className="h-4 w-4" /> {c.has_video ? "Replace video (MP4)" : "Upload video (MP4)"}
                    </span>
                  </label>
                  <label className={cn("inline-flex", saving === "captions" && "pointer-events-none opacity-60")}>
                    <input type="file" accept=".vtt" className="sr-only" onChange={(e) => e.target.files?.[0] && upload("captions", e.target.files[0])} />
                    <span className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-[12.5px] font-medium hover:bg-canvas">
                      <Upload className="h-4 w-4" /> Upload captions (VTT)
                    </span>
                  </label>
                </div>
              </CardBody>
            </Card>
          )}

          {isVideo && (
            <Card>
              <CardHeader title="Production status" description="Internal production tracking for this content item." />
              <CardBody className="space-y-3">
                <ProductionPipeline stage={c.production_status} stages={meta.data.production_stages} />
                <div className="flex items-end gap-2">
                  <Field label="Move to stage" htmlFor="stage" className="w-60">
                    <Select
                      id="stage"
                      value={c.production_status}
                      onChange={(e) => patch("stage", "/production-status", { production_status: e.target.value }, "PATCH", "Production status updated")}
                    >
                      {meta.data.production_stages.map((s) => <option key={s}>{s}</option>)}
                    </Select>
                  </Field>
                </div>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader
              title="Metadata"
              actions={<Button size="sm" variant="primary" onClick={saveMeta} loading={saving === "meta"}><Save /> Save metadata</Button>}
            />
            <CardBody className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Title" htmlFor="m-title" className="sm:col-span-2"><Input id="m-title" {...f("title")} /></Field>
                <Field label="Description" htmlFor="m-desc" className="sm:col-span-2"><Textarea id="m-desc" {...f("description")} /></Field>
                <Field label="Learning objective" htmlFor="m-obj" className="sm:col-span-2"><Textarea id="m-obj" {...f("learning_objective")} /></Field>
                <Field label="Instructor" htmlFor="m-ins"><Input id="m-ins" {...f("instructor")} /></Field>
                {isVideo && (
                  <Field label="Duration (minutes)" htmlFor="m-dur" hint="Normal 8–12 min · deep technical demonstration up to 20 min">
                    <Input id="m-dur" type="number" step="0.5" {...f("duration_minutes")} />
                  </Field>
                )}
                {isVideo && (
                  <div className="sm:col-span-2">
                    <Checkbox checked={!!form.is_deep_dive} onChange={(v) => setForm((s) => ({ ...s, is_deep_dive: v }))} label="Deep technical demonstration (up to 20 minutes)" />
                  </div>
                )}
              </div>
              {isVideo && (
                <div>
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">Technical metadata</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Resolution" htmlFor="t-res"><Input id="t-res" {...f("resolution")} /></Field>
                    <Field label="Aspect ratio" htmlFor="t-ar"><Input id="t-ar" {...f("aspect_ratio")} /></Field>
                    <Field label="Frame rate (fps)" htmlFor="t-fr"><Input id="t-fr" {...f("frame_rate")} /></Field>
                    <Field label="Format" htmlFor="t-fmt"><Input id="t-fmt" {...f("file_format")} /></Field>
                    <Field label="Codec" htmlFor="t-codec"><Input id="t-codec" {...f("codec")} /></Field>
                    <Field label="Audio sample rate" htmlFor="t-asr"><Input id="t-asr" {...f("audio_sample_rate")} /></Field>
                  </div>
                </div>
              )}
              <div>
                <p className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-muted">AI usage disclosure</p>
                <Checkbox checked={!!form.ai_used} onChange={(v) => setForm((s) => ({ ...s, ai_used: v }))} label="AI tools were used during production" />
                {form.ai_used && (
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <Field label="AI tool" htmlFor="ai-t"><Input id="ai-t" {...f("ai_tool")} /></Field>
                    <Field label="Purpose" htmlFor="ai-p"><Input id="ai-p" {...f("ai_purpose")} /></Field>
                    <Field label="Human / qualified reviewer" htmlFor="ai-r"><Input id="ai-r" {...f("ai_human_reviewer")} /></Field>
                  </div>
                )}
                <Field label="Disclosure statement" htmlFor="ai-d" className="mt-3"><Textarea id="ai-d" {...f("ai_disclosure_text")} /></Field>
              </div>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          {isVideo && (
            <Card>
              <CardHeader title="Quality control checklist" description="Toggle each check when verified. Overall status updates automatically." />
              <CardBody className="space-y-3">
                <ul className="divide-y divide-line rounded-md border border-line">
                  {meta.data.qc_fields.map((q) => {
                    const ok = c.qc[q.key];
                    return (
                      <li key={q.key} className="flex items-center gap-3 px-3 py-2">
                        {ok ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <Circle className="h-4 w-4 text-subtle" />}
                        <span className="flex-1 text-[13px]">{q.label}</span>
                        <span className={cn("text-[12px] font-medium", ok ? "text-ok" : "text-warn")}>{ok ? "✓" : "Pending"}</span>
                        <Button size="xs" variant="outline" loading={saving === q.key} onClick={() => patch(q.key, "/qc", { [q.key]: !ok })}>
                          {ok ? "Undo" : "Mark done"}
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <div className="flex items-center justify-between rounded-md border border-line px-3 py-2">
                  <Checkbox
                    checked={c.qc_needs_review}
                    onChange={(v) => patch("nr", "/qc", { qc_needs_review: v })}
                    label="Flag as Needs Review"
                  />
                  <StatusBadge status={c.overall_status} />
                </div>
                <Field label="QC notes" htmlFor="qcn">
                  <Textarea id="qcn" value={notes} onChange={(e) => setNotes(e.target.value)} />
                </Field>
                <div className="flex items-center justify-between">
                  <p className="text-[11.5px] text-muted">
                    {c.qc_reviewed_by ? `Last QC update by ${c.qc_reviewed_by} · ${fmtDateTime(c.qc_reviewed_at)}` : "No QC review yet"}
                  </p>
                  <Button size="sm" variant="outline" loading={saving === "notes"} onClick={() => patch("notes", "/qc", { qc_notes: notes })}>Save notes</Button>
                </div>
              </CardBody>
            </Card>
          )}
          {isVideo && (
            <Card>
              <CardHeader title="Content restrictions compliance" description="All must be confirmed before a video can be Ready." />
              <CardBody>
                <ul className="space-y-1.5">
                  {meta.data.restrictions.map((r) => (
                    <li key={r.key}>
                      <Checkbox
                        checked={!!c.compliance[r.key]}
                        onChange={(v) => patch(`r-${r.key}`, "/qc", { compliance: { [r.key]: v } })}
                        label={r.label}
                      />
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          {isVideo && c.technical_compliance && (
            <Card>
              <CardHeader title="Technical specification check" description="Derived from stored technical metadata." />
              <CardBody>
                <ul className="space-y-1.5 text-[13px]">
                  {c.technical_compliance.map((t) => (
                    <li key={t.label} className="flex items-center gap-2">
                      {t.met ? <CheckCircle2 className="h-4 w-4 text-ok" /> : <XCircle className="h-4 w-4 text-bad" />}
                      {t.label}
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
          <Card>
            <CardHeader title="Linked learning components" />
            <CardBody>
              <KeyValue
                cols={1}
                items={[
                  ["Course", <Link key="c" href={`/admin/courses/${c.course_id}`} className="text-brand-600 hover:underline">{c.course}</Link>],
                  ["Module", c.module ? `M${c.module_sequence}: ${c.module}` : "—"],
                  ["Lesson", c.lesson],
                  ["Practical", c.practical ? `${c.practical.code} · ${c.practical.title}` : "—"],
                  ["Exercise", c.exercise ? `${c.exercise.code} · ${c.exercise.title}` : "—"],
                  ["Assessment", c.assessment ? `${c.assessment.code} · ${c.assessment.title}` : "—"],
                ]}
              />
            </CardBody>
          </Card>
          {!isVideo && <Alert tone="info">Resource records accompany modules (guides, workbooks, templates).</Alert>}
        </div>
      </div>
    </>
  );
}
