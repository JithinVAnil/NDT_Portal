"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input, Select } from "./ui/form";
import { Button } from "./ui/button";
import { EmptyState } from "./ui/states";

export type { ColumnDef };

export function DataTable<T>({
  columns,
  data,
  searchPlaceholder = "Search…",
  searchable = true,
  pageSize = 15,
  toolbar,
  emptyTitle = "No records found",
  emptyDescription,
  onRowClick,
  initialSort,
  dense,
  caption,
}: {
  columns: ColumnDef<T, any>[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  data: T[];
  searchPlaceholder?: string;
  searchable?: boolean;
  pageSize?: number;
  toolbar?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  initialSort?: SortingState;
  dense?: boolean;
  caption?: string;
}) {
  const [sorting, setSorting] = React.useState<SortingState>(initialSort ?? []);
  const [globalFilter, setGlobalFilter] = React.useState("");
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize });

  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: (v) => {
      setGlobalFilter(v);
      setPagination((p) => ({ ...p, pageIndex: 0 }));
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    globalFilterFn: "includesString",
  });

  const total = table.getFilteredRowModel().rows.length;
  const { pageIndex, pageSize: size } = table.getState().pagination;
  const from = total === 0 ? 0 : pageIndex * size + 1;
  const to = Math.min(total, (pageIndex + 1) * size);

  return (
    <div>
      {(searchable || toolbar) && (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-2.5">
          {searchable && (
            <div className="relative w-full sm:w-72">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-subtle" />
              <Input
                value={globalFilter}
                onChange={(e) => table.setGlobalFilter(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-8"
                aria-label="Search table"
              />
            </div>
          )}
          <div className="flex flex-1 flex-wrap items-center justify-end gap-2">{toolbar}</div>
        </div>
      )}
      <div className="scroll-thin overflow-x-auto">
        <table className="w-full border-collapse text-left text-[13px]">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-line bg-[#f7f9fb]">
                {hg.headers.map((h) => {
                  const canSort = h.column.getCanSort();
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      className="whitespace-nowrap px-3 py-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted first:pl-4 last:pr-4"
                      aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : undefined}
                    >
                      {h.isPlaceholder ? null : canSort ? (
                        <button
                          className="inline-flex items-center gap-1 uppercase hover:text-ink"
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : sorted === "desc" ? (
                            <ArrowDown className="h-3 w-3" />
                          ) : (
                            <ArrowUpDown className="h-3 w-3 opacity-40" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className={cn(
                  "border-b border-line/70 last:border-0 hover:bg-brand-50/60",
                  onRowClick && "cursor-pointer",
                )}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                onKeyDown={onRowClick ? (e) => e.key === "Enter" && onRowClick(row.original) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cn("px-3 align-middle first:pl-4 last:pr-4", dense ? "py-1.5" : "py-2.5")}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {total === 0 && <EmptyState title={emptyTitle} description={emptyDescription} />}
      </div>
      {total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2 text-[12.5px] text-muted">
          <span className="tabular">
            Showing {from}–{to} of {total}
          </span>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5">
              <span className="hidden sm:inline">Rows</span>
              <Select
                value={size}
                onChange={(e) => table.setPageSize(Number(e.target.value))}
                className="h-8 w-[70px]"
                aria-label="Rows per page"
              >
                {[10, 15, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </Select>
            </label>
            <Button variant="outline" size="icon" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()} aria-label="Previous page">
              <ChevronLeft />
            </Button>
            <span className="tabular">
              {pageIndex + 1} / {table.getPageCount()}
            </span>
            <Button variant="outline" size="icon" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()} aria-label="Next page">
              <ChevronRight />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
