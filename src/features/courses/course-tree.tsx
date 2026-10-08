"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  FlaskConical,
  KeyRound,
  ListChecks,
  PencilRuler,
  PlayCircle,
  Ruler,
} from "lucide-react";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { cn, pct } from "@/lib/utils";
import type { AssessmentDef, ContentItem, CourseTree, Practical } from "@/types/api";

export const HIERARCHY = ["Course", "Module", "Lesson", "Instructional Video", "Resource", "Practical", "Exercise", "Assessment", "Rubric", "Completion"];

export function HierarchyStrip() {
  return (
    <ol className="flex flex-wrap items-center gap-y-1.5 text-[11.5px]" aria-label="Course structure">
      {HIERARCHY.map((h, i) => (
        <li key={h} className="flex items-center">
          <span className="rounded border border-line bg-white px-2 py-0.5 font-medium text-navy-800">{h}</span>
          {i < HIERARCHY.length - 1 && <ChevronRight className="mx-0.5 h-3 w-3 text-subtle" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

function Row({
  icon: Icon,
  kind,
  title,
  meta,
  right,
  href,
  depth = 0,
}: {
  icon: React.ElementType;
  kind: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  right?: React.ReactNode;
  href?: string;
  depth?: number;
}) {
  const content = (
    <div
      className={cn("flex items-start gap-2.5 rounded-md px-2.5 py-1.5 hover:bg-canvas", href && "cursor-pointer")}
      style={{ marginLeft: depth * 20 }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-navy-700" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-[13px]">
          <span className="mr-1.5 text-[10.5px] font-semibold uppercase tracking-wide text-subtle">{kind}</span>
          <span className={cn("font-medium", href && "text-brand-600")}>{title}</span>
        </p>
        {meta && <p className="text-[12px] text-muted">{meta}</p>}
      </div>
      {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
    </div>
  );
  return href ? <Link href={href}>{content}</Link> : content;
}

function ContentRow({ c, depth, contentHref }: { c: ContentItem; depth: number; contentHref?: (c: ContentItem) => string | undefined }) {
  const isVideo = c.content_type === "Video";
  return (
    <Row
      depth={depth}
      icon={isVideo ? PlayCircle : FileText}
      kind={isVideo ? "Video" : "Resource"}
      title={`${c.code} · ${c.title}`}
      href={contentHref?.(c)}
      meta={isVideo ? `${c.duration_minutes} min${c.is_deep_dive ? " · deep technical demonstration" : ""} · ${c.instructor ?? ""}` : c.description}
      right={
        isVideo ? (
          <>
            {!c.has_video && <Badge tone="neutral">Asset to be inserted</Badge>}
            <StatusBadge status={c.overall_status} />
          </>
        ) : undefined
      }
    />
  );
}

function PracticalRow({ p, depth, showLearner }: { p: Practical; depth: number; showLearner?: boolean }) {
  return (
    <>
      <Row
        depth={depth}
        icon={FlaskConical}
        kind="Practical"
        title={`${p.code} · ${p.title}`}
        meta={p.objective}
        right={
          showLearner ? (
            p.submission ? (
              <>
                <StatusBadge status={p.submission.status} />
                {p.submission.score !== null && <span className="tabular text-[12px]">{p.submission.score}/{p.max_score}</span>}
              </>
            ) : (
              <StatusBadge status="Not Started" />
            )
          ) : (
            <span className="text-[12px] text-muted">{p.estimated_minutes} min</span>
          )
        }
      />
      {p.rubric && (
        <Row depth={depth + 1} icon={Ruler} kind="Rubric" title={p.rubric.title} meta={p.rubric.criteria.map((c) => `${c.name} ${c.max_score}`).join(" · ")} />
      )}
    </>
  );
}

function AssessmentRow({ a, depth, showLearner }: { a: AssessmentDef; depth: number; showLearner?: boolean }) {
  return (
    <>
      <Row
        depth={depth}
        icon={ClipboardCheck}
        kind={a.type}
        title={`${a.code} · ${a.title}`}
        meta={`Max ${a.max_score} · pass ${a.pass_percentage}%${a.has_answer_key ? " · answer key available" : ""}`}
        right={
          showLearner ? (
            a.result ? (
              <>
                <span className="tabular text-[12px]">{a.result.score}/{a.result.max_score} ({pct(a.result.percentage)})</span>
                <StatusBadge status={a.result.passed ? "Pass" : "Fail"} />
              </>
            ) : (
              <StatusBadge status="Pending" />
            )
          ) : undefined
        }
      />
      {a.rubric && <Row depth={depth + 1} icon={Ruler} kind="Rubric" title={a.rubric.title} meta={`${a.rubric.criteria.length} criteria · total ${a.rubric.total_score}`} />}
    </>
  );
}

export function CourseTreeView({
  tree,
  showLearner = false,
  contentHref,
  defaultOpen,
}: {
  tree: CourseTree;
  showLearner?: boolean;
  contentHref?: (c: ContentItem) => string | undefined;
  defaultOpen?: number[];
}) {
  const [open, setOpen] = React.useState<Set<number>>(
    new Set(defaultOpen ?? tree.modules.filter((m) => m.status === "In Progress").map((m) => m.id).concat(tree.modules[0] ? [tree.modules[0].id] : [])),
  );
  const toggle = (id: number) =>
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  return (
    <div className="divide-y divide-line">
      {tree.modules.map((m) => {
        const isOpen = open.has(m.id);
        const counts = [
          `${m.lessons.length} lessons`,
          `${m.lessons.reduce((s, l) => s + l.content.filter((c) => c.content_type === "Video").length, 0) + m.content.filter((c) => c.content_type === "Video").length} videos`,
          m.practicals.length ? `${m.practicals.length} practical` : null,
          m.assessments.length ? `${m.assessments.length} assessment` : null,
        ].filter(Boolean);
        return (
          <div key={m.id}>
            <button
              className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-canvas"
              onClick={() => toggle(m.id)}
              aria-expanded={isOpen}
            >
              {isOpen ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronRight className="h-4 w-4 text-muted" />}
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-navy-900 text-[12px] font-semibold text-white">
                M{m.sequence}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] font-semibold text-ink">{m.title}</span>
                <span className="block text-[12px] text-muted">{counts.join(" · ")}</span>
              </span>
              {m.status && <StatusBadge status={m.status === "Completed" ? "Completed" : m.status === "In Progress" ? "In Progress" : "Not Started"} />}
            </button>
            {isOpen && (
              <div className="space-y-0.5 bg-[#fbfcfd] px-4 pb-3 pt-1">
                {m.description && <p className="mb-1 pl-9 text-[12.5px] text-muted">{m.description}</p>}
                {m.lessons.map((l) => (
                  <React.Fragment key={l.id}>
                    <Row depth={1} icon={ListChecks} kind="Lesson" title={`${m.sequence}.${l.sequence} ${l.title}`} meta={l.objective} />
                    {l.content.map((c) => (
                      <ContentRow key={c.id} c={c} depth={2} contentHref={contentHref} />
                    ))}
                    {l.exercises.map((e) => (
                      <Row
                        key={e.id}
                        depth={2}
                        icon={PencilRuler}
                        kind="Exercise"
                        title={`${e.code} · ${e.title}`}
                        meta={e.description}
                        right={e.has_answer_key ? <Badge tone="neutral"><KeyRound className="h-3 w-3" /> Answer key</Badge> : undefined}
                      />
                    ))}
                  </React.Fragment>
                ))}
                {m.content.map((c) => (
                  <ContentRow key={c.id} c={c} depth={1} contentHref={contentHref} />
                ))}
                {m.exercises.map((e) => (
                  <Row key={e.id} depth={1} icon={PencilRuler} kind="Exercise" title={`${e.code} · ${e.title}`} meta={e.description} />
                ))}
                {m.practicals.map((p) => (
                  <PracticalRow key={p.id} p={p} depth={1} showLearner={showLearner} />
                ))}
                {m.assessments.map((a) => (
                  <AssessmentRow key={a.id} a={a} depth={1} showLearner={showLearner} />
                ))}
              </div>
            )}
          </div>
        );
      })}
      {(tree.course_assessments.length > 0 || tree.course_practicals.length > 0) && (
        <div className="space-y-0.5 px-4 py-3">
          <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Course-level assessment</p>
          {tree.course_practicals.map((p) => (
            <PracticalRow key={p.id} p={p} depth={0} showLearner={showLearner} />
          ))}
          {tree.course_assessments.map((a) => (
            <AssessmentRow key={a.id} a={a} depth={0} showLearner={showLearner} />
          ))}
        </div>
      )}
    </div>
  );
}
