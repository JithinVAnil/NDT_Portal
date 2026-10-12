"use client";

import * as React from "react";
import { ExternalLink, Film, RefreshCcw } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/states";
import type { ContentItem } from "@/types/api";

interface PlaybackResponse {
  success: boolean;
  message: string;
  content_code: string;
  course_ref: string;
  learner_ref: string;
  playback_url: string;
  expires_in_seconds: number;
  requires_ndu_login: boolean;
  note: string;
}

/**
 * NDU playback hook. The portal does not host or play video itself — it requests
 * a time-limited playback URL from NDU (demo adapter returns a placeholder token).
 */
export function NduVideoPlayer({ item }: { item: ContentItem }) {
  const [res, setRes] = React.useState<PlaybackResponse | null>(null);
  const [err, setErr] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const request = async () => {
    setLoading(true);
    setErr(null);
    try {
      const data = await api<PlaybackResponse>(`/ndu/playback/${item.id}`);
      setRes(data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not request playback from NDU");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-[#9aa8bd] bg-[#eef2f7] text-center">
      <div
        className="pointer-events-none absolute inset-0 opacity-50"
        style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 14px, #e1e7ef 14px 15px)" }}
        aria-hidden
      />
      <Film className="relative mb-2 h-9 w-9 text-[#7b8aa1]" aria-hidden />
      <p className="relative text-[13px] font-bold tracking-wide text-navy-800">VIDEO PLAYBACK VIA NDU</p>
      <p className="relative mt-1 max-w-md px-4 text-[12px] text-muted">
        {item.code} · {item.title} · {item.duration_minutes} min. This portal does not host video — playback is
        streamed from NDU. Request a time-limited playback link below.
      </p>
      <div className="relative mt-3 flex gap-2">
        <Button size="sm" variant="primary" loading={loading} onClick={request}>
          <RefreshCcw /> Request playback from NDU
        </Button>
      </div>
      {err && (
        <Alert tone="bad" className="relative mt-3 mx-4 max-w-md">{err}</Alert>
      )}
      {res && (
        <div className="relative mt-3 mx-4 max-w-md space-y-2 text-left">
          <Alert tone={res.success ? "ok" : "bad"}>{res.message}</Alert>
          <dl className="rounded-md border border-line bg-white p-3 text-[12px] space-y-1">
            <div className="flex justify-between gap-3"><dt className="text-muted">Content</dt><dd className="font-mono">{res.content_code}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Course ref</dt><dd className="font-mono">{res.course_ref}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Learner ref</dt><dd className="font-mono">{res.learner_ref}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">Link expires</dt><dd>{Math.round(res.expires_in_seconds / 60)} min</dd></div>
            <div className="pt-1 break-all">
              <a href={res.playback_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-brand-600 hover:underline">
                <ExternalLink className="h-3.5 w-3.5" /> {res.playback_url}
              </a>
            </div>
          </dl>
          <p className="text-[11px] text-muted">{res.note}</p>
        </div>
      )}
    </div>
  );
}
