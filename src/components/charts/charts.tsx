"use client";

import { useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { cn } from "cn";

/** Card frame every chart sits in: a title that states the question it answers. */
export function ChartCard({ title, description, actions, children, className }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card p-5 shadow-xs", className)}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-h3">{title}</h2>
          {description && <p className="text-small text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

const axis = { stroke: "var(--border-strong)", fontSize: 12, tick: { fill: "var(--muted-foreground)" }, tickLine: false, axisLine: false } as const;

function TooltipBox({ title, rows }: { title: string; rows: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 text-small shadow-lg">
      <p className="mb-1 font-medium text-foreground">{title}</p>
      {rows.map((r) => (
        <p key={r.label} className="flex items-center gap-2 text-muted-foreground">
          {r.color && <span className="size-2 rounded-full" style={{ background: r.color }} aria-hidden />}
          <span className="flex-1">{r.label}</span>
          <span className="tabular font-medium text-foreground">{r.value}</span>
        </p>
      ))}
    </div>
  );
}

export type TrendPoint = { label: string; rate: number | null; detail?: { label: string; value: string }[] };

/** Single-series percentage trend (e.g. daily attendance rate) with an optional target line. */
export function RateTrendChart({ data, target, height = 240, name = "Attendance" }: { data: TrendPoint[]; target?: number; height?: number; name?: string }) {
  const values = data.map((d) => d.rate).filter((v): v is number => v !== null);
  const min = values.length ? Math.max(0, Math.floor((Math.min(...values, target ?? 100) - 5) / 5) * 5) : 0;
  return (
    <div style={{ height }} role="img" aria-label={`${name} trend chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="rateFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" {...axis} minTickGap={24} />
          <YAxis domain={[min, 100]} {...axis} tickFormatter={(v: number) => `${v}%`} width={48} />
          {target !== undefined && <ReferenceLine y={target} stroke="var(--warning)" strokeDasharray="4 4" label={{ value: `Target ${target}%`, position: "insideTopLeft", fill: "var(--warning-foreground)", fontSize: 11 }} />}
          <Tooltip
            cursor={{ stroke: "var(--border-strong)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0]!.payload as TrendPoint;
              return <TooltipBox title={p.label} rows={[{ label: name, value: p.rate === null ? "—" : `${p.rate.toFixed(1)}%`, color: "var(--chart-1)" }, ...(p.detail ?? [])]} />;
            }}
          />
          <Area type="monotone" dataKey="rate" stroke="var(--chart-1)" strokeWidth={2} fill="url(#rateFill)" animationDuration={400} connectNulls dot={false} activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Single-series columns over time (e.g. daily collections). */
export function AmountColumnChart({ data, format, tickFormat = format, height = 240, name = "Amount" }: { data: { label: string; value: number }[]; format: (v: number) => string; tickFormat?: (v: number) => string; height?: number; name?: string }) {
  return (
    <div style={{ height }} role="img" aria-label={`${name} by day`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }} barCategoryGap={3}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" {...axis} minTickGap={24} />
          <YAxis {...axis} width={56} tickFormatter={(v: number) => tickFormat(v)} />
          <Tooltip
            cursor={{ fill: "var(--muted)" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const d = payload[0]!.payload as { label: string; value: number };
              return <TooltipBox title={d.label} rows={[{ label: name, value: format(d.value), color: "var(--chart-1)" }]} />;
            }}
          />
          <Bar dataKey="value" fill="var(--chart-1)" radius={[4, 4, 0, 0]} animationDuration={400} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export type BarDatum = { id?: string; label: string; value: number; hint?: string };

/** Horizontal bars, sorted, one hue; values below `threshold` are flagged in the label. */
export function RankedBarChart({
  data: all,
  threshold,
  unit = "%",
  max = 100,
  valueLabel = "Attendance",
  hintLabel = "Students",
  limit = 10,
}: {
  data: BarDatum[];
  threshold?: number;
  unit?: string;
  max?: number;
  valueLabel?: string;
  hintLabel?: string;
  /** Rows shown before "Show all" — the list is ranked, so the first rows matter most. */
  limit?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const data = expanded ? all : all.slice(0, limit);
  const height = Math.max(160, data.length * 30 + 24);
  return (
    <div>
      <div style={{ height }} role="img" aria-label="Comparison chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 40, bottom: 0, left: 0 }} barCategoryGap={6}>
            <CartesianGrid horizontal={false} stroke="var(--border)" />
            <XAxis type="number" domain={[0, max]} {...axis} tickFormatter={(v: number) => `${v}${unit}`} />
            <YAxis type="category" dataKey="label" {...axis} width={150} interval={0} />
            {threshold !== undefined && <ReferenceLine x={threshold} stroke="var(--warning)" strokeDasharray="4 4" />}
            <Tooltip
              cursor={{ fill: "var(--muted)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]!.payload as BarDatum;
                return <TooltipBox title={d.label} rows={[{ label: valueLabel, value: `${d.value.toFixed(1)}${unit}`, color: "var(--chart-1)" }, ...(d.hint ? [{ label: hintLabel, value: d.hint }] : [])]} />;
              }}
            />
            <Bar dataKey="value" animationDuration={400} radius={[0, 4, 4, 0]} label={{ position: "right", fill: "var(--muted-foreground)", fontSize: 12, formatter: (v: unknown) => `${Math.round(Number(v))}${unit}` }}>
              {data.map((d) => (
                <Cell key={d.id ?? d.label} fill={threshold !== undefined && d.value < threshold ? "var(--chart-4)" : "var(--chart-1)"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {all.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          className="mt-2 rounded-sm text-small font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          {expanded ? "Show fewer" : `Show all ${all.length}`}
        </button>
      )}
    </div>
  );
}
