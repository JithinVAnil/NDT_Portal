import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Backend timestamps are UTC ISO strings ("...Z"). Display in India Standard Time. */
function toDate(v?: string | null): Date | null {
  if (!v) return null;
  const s = /[zZ]|[+-]\d\d:\d\d$/.test(v) || v.length <= 10 ? v : `${v}Z`;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(v?: string | null): string {
  if (!v) return "—";
  if (v.length === 10) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  }
  const d = toDate(v);
  return d ? d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "Asia/Kolkata" }) : "—";
}

export function fmtDateTime(v?: string | null): string {
  const d = toDate(v);
  if (!d) return "—";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Kolkata",
  });
}

export function timeAgo(v?: string | null): string {
  const d = toDate(v);
  if (!d) return "—";
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export function pct(v?: number | null, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v.toFixed(digits)}%`;
}

export function num(v?: number | null): string {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("en-IN");
}

export function hours(minutes?: number | null): string {
  if (!minutes) return "0 min";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

export function initials(name?: string | null): string {
  if (!name) return "?";
  return name
    .replace(/^(Dr\.|Shri|Smt\.)\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
}
