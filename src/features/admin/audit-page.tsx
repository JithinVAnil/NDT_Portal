"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useApi } from "@/hooks/use-api";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/states";
import { fmtDateTime } from "@/lib/utils";
import type { AuditEntry } from "@/types/api";

export function AuditPage() {
  const [page, setPage] = React.useState(1);
  const [q, setQ] = React.useState("");
  const [qDebounced, setQDebounced] = React.useState("");
  const [action, setAction] = React.useState("");
  const [role, setRole] = React.useState("");
  const [entity, setEntity] = React.useState("");
  const [result, setResult] = React.useState("");
  React.useEffect(() => {
    const t = setTimeout(() => {
      setQDebounced(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const facets = useApi<{ actions: string[]; entities: string[]; roles: string[] }>("/audit/facets");
  const { data, error, loading, reload } = useApi<{ items: AuditEntry[]; total: number; page: number; page_size: number }>("/audit", {
    page,
    page_size: 50,
    q: qDebounced,
    action,
    role,
    entity,
    result,
  });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const reset = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    fn(e.target.value);
    setPage(1);
  };

  return (
    <>
      <PageHeader
        title="Audit Trail"
        description="Immutable record of logins, workflow transitions, attendance, assessments, NDU sync, reports, exports, content QC and settings."
        breadcrumbs={[{ label: "Administrator" }, { label: "Audit Trail" }]}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          <div className="relative w-full sm:w-72">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search user, entity ID, details…" className="pl-8" aria-label="Search audit trail" />
          </div>
          <Select value={action} onChange={reset(setAction)} className="w-56" aria-label="Action">
            <option value="">All actions</option>
            {(facets.data?.actions ?? []).map((a) => <option key={a}>{a}</option>)}
          </Select>
          <Select value={entity} onChange={reset(setEntity)} className="w-40" aria-label="Entity">
            <option value="">All entities</option>
            {(facets.data?.entities ?? []).map((a) => <option key={a}>{a}</option>)}
          </Select>
          <Select value={role} onChange={reset(setRole)} className="w-40" aria-label="Role">
            <option value="">All roles</option>
            {(facets.data?.roles ?? []).map((a) => <option key={a}>{a}</option>)}
          </Select>
          <Select value={result} onChange={reset(setResult)} className="w-36" aria-label="Result">
            <option value="">All results</option>
            <option>SUCCESS</option>
            <option>FAILURE</option>
          </Select>
          <Button variant="ghost" size="sm" onClick={() => reload()}>Refresh</Button>
        </div>
        {error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : loading && !data ? (
          <LoadingBlock rows={10} />
        ) : !data || data.items.length === 0 ? (
          <EmptyState title="No audit records match these filters." />
        ) : (
          <div className="scroll-thin overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <caption className="sr-only">Audit trail</caption>
              <thead>
                <tr className="border-b border-line bg-[#f7f9fb] text-[11px] uppercase tracking-wide text-muted">
                  {["Timestamp", "User", "Role", "Action", "Entity", "Entity ID", "Result", "Details"].map((h) => (
                    <th key={h} scope="col" className="whitespace-nowrap px-3 py-2 first:pl-4">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((a) => (
                  <tr key={a.id} className="border-b border-line/70 align-top">
                    <td className="whitespace-nowrap px-3 py-2 pl-4 tabular">{fmtDateTime(a.timestamp)}</td>
                    <td className="px-3 py-2">
                      <p className="font-medium">{a.user}</p>
                      <p className="text-[11.5px] text-muted">{a.user_email}</p>
                    </td>
                    <td className="px-3 py-2">{a.role ? <Badge tone={a.role === "ADMIN" ? "navy" : a.role === "DEPARTMENT" ? "info" : "neutral"}>{a.role}</Badge> : "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11.5px]">{a.action}</td>
                    <td className="px-3 py-2">{a.entity ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-[11.5px]">{a.entity_id ?? "—"}</td>
                    <td className="px-3 py-2"><StatusBadge status={a.result} /></td>
                    <td className="max-w-[420px] px-3 py-2 text-muted">{a.details ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && data.total > 0 && (
          <div className="flex items-center justify-between border-t border-line px-4 py-2 text-[12.5px] text-muted">
            <span className="tabular">
              {(page - 1) * data.page_size + 1}–{Math.min(page * data.page_size, data.total)} of {data.total} events
            </span>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} aria-label="Previous page"><ChevronLeft /></Button>
              <span className="tabular">{page} / {pages}</span>
              <Button variant="outline" size="icon" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} aria-label="Next page"><ChevronRight /></Button>
            </div>
          </div>
        )}
      </Card>
    </>
  );
}
