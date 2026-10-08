"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Badge } from "@/components/ui/badge";

interface Result {
  type: string;
  title: string;
  subtitle: string;
  href: string;
}

/** Role-scoped global search (the backend enforces scoping). */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [results, setResults] = React.useState<Result[]>([]);
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const boxRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await api<{ results: Result[] }>("/search", { query: { q } });
        setResults(res.results);
        setActive(0);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (r: Result) => {
    setOpen(false);
    setQ("");
    router.push(r.href);
  };

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, results.length - 1));
          if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          if (e.key === "Enter" && results[active]) go(results[active]);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Search learner, ID, department, batch, course, nomination…"
        className="h-9 w-full rounded-md border border-line bg-canvas pl-8 pr-8 text-[13px] placeholder:text-subtle focus:bg-white"
        aria-label="Global search"
        role="combobox"
        aria-expanded={open}
        aria-controls="global-search-results"
      />
      {loading && <Loader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-subtle" />}
      {open && q.trim().length >= 2 && (
        <ul
          id="global-search-results"
          role="listbox"
          className="absolute left-0 right-0 top-11 z-40 max-h-96 overflow-y-auto rounded-md border border-line bg-white py-1 shadow-lg"
        >
          {results.length === 0 && !loading && <li className="px-3 py-3 text-[13px] text-muted">No matches within your access scope.</li>}
          {results.map((r, i) => (
            <li key={`${r.type}-${r.href}-${i}`} role="option" aria-selected={i === active}>
              <button
                className={`flex w-full items-center gap-3 px-3 py-2 text-left ${i === active ? "bg-brand-50" : "hover:bg-canvas"}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
              >
                <Badge tone="neutral" className="w-[86px] justify-center">{r.type}</Badge>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-ink">{r.title}</span>
                  <span className="block truncate text-[12px] text-muted">{r.subtitle}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
