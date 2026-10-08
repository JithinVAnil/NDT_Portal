"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";

/** Validated categorical order (blue, orange, aqua, yellow) — fixed, never cycled. */
export const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"];
/** Reserved status colours (never reused as series colours). */
export const STATUS = { ok: "#1e7b4f", warn: "#d68a00", bad: "#b42318", info: "#2a78d6", neutral: "#9aa3b2" };

const AXIS = { fontSize: 11.5, fill: "#5a6475" };
const GRID = "#e8ecf2";

function TooltipBox({ active, payload, label, unit }: { active?: boolean; payload?: any[]; label?: string; unit?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-white px-3 py-2 text-[12px] shadow-md">
      {label && <p className="mb-1 font-semibold text-ink">{label}</p>}
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-muted">
          <span className="inline-block h-2 w-2 rounded-sm" style={{ background: p.color || p.fill }} aria-hidden />
          <span>{p.name}:</span>
          <span className="tabular font-semibold text-ink">
            {p.value === null || p.value === undefined ? "—" : `${typeof p.value === "number" ? Number(p.value.toFixed(1)) : p.value}${unit ?? ""}`}
          </span>
        </p>
      ))}
    </div>
  );
}

export function ChartFrame({ height = 240, children }: { height?: number; children: React.ReactElement }) {
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series bar chart (magnitude). */
export function SimpleBar({
  data,
  x,
  y,
  name,
  unit,
  height = 240,
  color = SERIES[0],
  horizontal = false,
  max,
}: {
  data: Record<string, any>[];
  x: string;
  y: string;
  name: string;
  unit?: string;
  height?: number;
  color?: string;
  horizontal?: boolean;
  max?: number;
}) {
  if (horizontal) {
    return (
      <ChartFrame height={height}>
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, left: 8, bottom: 4 }} barCategoryGap={6}>
          <CartesianGrid horizontal={false} stroke={GRID} />
          <XAxis type="number" tick={AXIS} axisLine={false} tickLine={false} domain={[0, max ?? "auto"]} />
          <YAxis type="category" dataKey={x} tick={AXIS} axisLine={false} tickLine={false} width={150} />
          <Tooltip content={<TooltipBox unit={unit} />} cursor={{ fill: "#f1f4f8" }} />
          <Bar dataKey={y} name={name} fill={color} radius={[0, 4, 4, 0]} maxBarSize={22}>
            <LabelList dataKey={y} position="right" style={{ fontSize: 11.5, fill: "#16202e" }} formatter={(v: any) => (v === null || v === undefined ? "" : `${v}${unit ?? ""}`)} />
          </Bar>
        </BarChart>
      </ChartFrame>
    );
  }
  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 18, right: 8, left: -12, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={x} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} interval={0} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} domain={[0, max ?? "auto"]} allowDecimals={false} />
        <Tooltip content={<TooltipBox unit={unit} />} cursor={{ fill: "#f1f4f8" }} />
        <Bar dataKey={y} name={name} fill={color} radius={[4, 4, 0, 0]} maxBarSize={44}>
          <LabelList dataKey={y} position="top" style={{ fontSize: 11.5, fill: "#16202e" }} formatter={(v: any) => (v ? `${v}${unit ?? ""}` : "")} />
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** Grouped bars for up to four series sharing one scale. */
export function GroupedBar({
  data,
  x,
  series,
  unit,
  height = 260,
  max,
}: {
  data: Record<string, any>[];
  x: string;
  series: { key: string; name: string }[];
  unit?: string;
  height?: number;
  max?: number;
}) {
  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 4 }} barGap={2}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={x} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} interval={0} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} domain={[0, max ?? "auto"]} />
        <Tooltip content={<TooltipBox unit={unit} />} cursor={{ fill: "#f1f4f8" }} />
        <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, color: "#5a6475" }} />
        {series.map((s, i) => (
          <Bar key={s.key} dataKey={s.key} name={s.name} fill={SERIES[i]} radius={[4, 4, 0, 0]} maxBarSize={22} />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

/** Stacked status bars (e.g. completion state per course) — uses reserved status colours. */
export function StatusStack({
  data,
  x,
  stack,
  height = 260,
}: {
  data: Record<string, any>[];
  x: string;
  stack: { key: string; name: string; color: string }[];
  height?: number;
}) {
  return (
    <ChartFrame height={height}>
      <BarChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={x} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} interval={0} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip content={<TooltipBox />} cursor={{ fill: "#f1f4f8" }} />
        <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: 12, color: "#5a6475" }} />
        {stack.map((s, i) => (
          <Bar
            key={s.key}
            dataKey={s.key}
            name={s.name}
            stackId="a"
            fill={s.color}
            stroke="#ffffff"
            strokeWidth={1}
            radius={i === stack.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
            maxBarSize={48}
          />
        ))}
      </BarChart>
    </ChartFrame>
  );
}

/** Single-series trend line. */
export function TrendLine({
  data,
  x,
  y,
  name,
  unit,
  height = 240,
  domain,
}: {
  data: Record<string, any>[];
  x: string;
  y: string;
  name: string;
  unit?: string;
  height?: number;
  domain?: [number, number];
}) {
  return (
    <ChartFrame height={height}>
      <LineChart data={data} margin={{ top: 12, right: 12, left: -12, bottom: 4 }}>
        <CartesianGrid vertical={false} stroke={GRID} />
        <XAxis dataKey={x} tick={AXIS} axisLine={{ stroke: GRID }} tickLine={false} />
        <YAxis tick={AXIS} axisLine={false} tickLine={false} domain={domain ?? [0, 100]} />
        <Tooltip content={<TooltipBox unit={unit} />} />
        <Line
          type="monotone"
          dataKey={y}
          name={name}
          stroke={SERIES[0]}
          strokeWidth={2}
          dot={{ r: 4, fill: SERIES[0], stroke: "#fff", strokeWidth: 2 }}
          activeDot={{ r: 6 }}
          connectNulls
        />
      </LineChart>
    </ChartFrame>
  );
}
