"use client";

import * as React from "react";
import { Film, Gauge } from "lucide-react";
import type { ContentItem } from "@/types/api";

/**
 * HTML5 player with native play/pause/seek/volume/fullscreen + captions track, and a playback-speed control.
 * If no real asset has been supplied yet, an honest placeholder is shown instead of a fake video.
 */
export function VideoPlayer({ item }: { item: ContentItem }) {
  const ref = React.useRef<HTMLVideoElement>(null);
  const [rate, setRate] = React.useState(1);

  if (!item.video_url) {
    return (
      <div className="relative flex aspect-video w-full flex-col items-center justify-center overflow-hidden rounded-md border border-dashed border-[#9aa8bd] bg-[#eef2f7] text-center">
        <div
          className="pointer-events-none absolute inset-0 opacity-50"
          style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent 0 14px, #e1e7ef 14px 15px)" }}
          aria-hidden
        />
        <Film className="relative mb-2 h-9 w-9 text-[#7b8aa1]" aria-hidden />
        <p className="relative text-[13px] font-bold tracking-wide text-navy-800">DEMO CONTENT RECORD — VIDEO ASSET TO BE INSERTED</p>
        <p className="relative mt-1 max-w-md px-4 text-[12px] text-muted">
          {item.code} · {item.title} · planned {item.duration_minutes} min · {item.resolution ?? "1920x1080"} {item.file_format ?? "MP4"}.
          The final instructional video will be uploaded here once produced and QC-approved.
        </p>
      </div>
    );
  }

  return (
    <div>
      <video
        ref={ref}
        className="aspect-video w-full rounded-md bg-black"
        controls
        preload="metadata"
        crossOrigin="anonymous"
        aria-label={`Instructional video: ${item.title}`}
      >
        <source src={item.video_url} />
        {item.captions_url && <track kind="captions" src={item.captions_url} srcLang="en" label="English" default />}
        Your browser does not support HTML5 video.
      </video>
      <div className="mt-2 flex items-center gap-2 text-[12px] text-muted">
        <Gauge className="h-4 w-4" aria-hidden />
        <label htmlFor={`rate-${item.id}`}>Playback speed</label>
        <select
          id={`rate-${item.id}`}
          value={rate}
          onChange={(e) => {
            const r = Number(e.target.value);
            setRate(r);
            if (ref.current) ref.current.playbackRate = r;
          }}
          className="h-7 rounded border border-line bg-white px-1.5 text-[12px]"
        >
          {[0.75, 1, 1.25, 1.5, 1.75, 2].map((r) => (
            <option key={r} value={r}>{r}×</option>
          ))}
        </select>
        <span className="ml-auto">{item.captions_url ? "Captions available (CC)" : "No caption file uploaded"}</span>
      </div>
    </div>
  );
}
