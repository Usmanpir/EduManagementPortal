import { cn } from "cn";
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { ColumnFormat, ReportCell, ReportResult } from "@/lib/reports";

export function formatCell(v: ReportCell | undefined, format: ColumnFormat | undefined, currency: string) {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") {
    if (format === "money") return formatMoney(v, currency);
    if (format === "percent") return formatPercent(v, 1);
    return formatNumber(v);
  }
  if (format === "date") return formatDate(v);
  return v;
}

const numeric = (f?: ColumnFormat) => f === "number" || f === "money" || f === "percent";

/** Summary tiles for a report result. */
export function ReportSummary({ summary, currency }: { summary: NonNullable<ReportResult["summary"]>; currency: string }) {
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {summary.map((s) => (
        <div key={s.label} className="rounded-xl border bg-card px-4 py-3 shadow-xs print:shadow-none">
          <dt className="text-caption text-muted-foreground">{s.label}</dt>
          <dd className="truncate tabular text-h3">{formatCell(s.value, s.format, currency)}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * A plain, accessible table for any report. Wide reports (e.g. a monthly
 * register) scroll sideways with the first two columns pinned.
 */
export function ReportTable({ result, currency, limit, dense = false }: { result: ReportResult; currency: string; limit?: number; /** Print layout: compact cells, nothing pinned. */ dense?: boolean }) {
  const rows = limit ? result.rows.slice(0, limit) : result.rows;
  const wide = result.columns.length > 12;
  const pin = wide && !dense;
  return (
    <div className="overflow-x-auto rounded-xl border bg-card shadow-xs print:overflow-visible print:rounded-none print:border-0 print:shadow-none">
      <table className={cn("w-full border-collapse", dense && wide ? "text-[0.625rem]" : wide || dense ? "text-caption" : "text-small")}>
        <thead className="bg-muted/50 print:bg-transparent">
          <tr className="border-b text-caption text-muted-foreground">
            {result.columns.map((c, i) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  dense && wide ? "h-7 px-1 font-medium whitespace-nowrap" : "h-9 px-2.5 font-medium whitespace-nowrap",
                  numeric(c.format) ? "text-end" : "text-start",
                  pin && i < 2 && "sticky bg-muted",
                  pin && i === 0 && "start-0",
                  pin && i === 1 && "start-12",
                  wide && i >= 2 && i < result.columns.length - 3 && "w-7 px-0.5 text-center",
                  c.muted && "bg-muted text-subtle-foreground print:bg-muted",
                )}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b last:border-0 hover:bg-muted/30">
              {result.columns.map((c, i) => {
                const v = r[c.key];
                const isMark = wide && i >= 2 && i < result.columns.length - 3;
                return (
                  <td
                    key={c.key}
                    className={cn(
                      dense && wide ? "px-1 py-0.5" : "px-2.5 py-1.5",
                      numeric(c.format) ? "text-end tabular" : "text-start",
                      i === 1 && "font-medium whitespace-nowrap",
                      pin && i < 2 && "sticky bg-card",
                      pin && i === 0 && "start-0 w-12",
                      pin && i === 1 && "start-12",
                      isMark && "px-0.5 text-center font-medium",
                      c.muted && "bg-muted/60 print:bg-muted/60",
                      isMark && v === "A" && "text-danger-foreground",
                      isMark && v === "L" && "text-warning-foreground",
                      isMark && v === "Lv" && "text-info-foreground",
                    )}
                  >
                    {isMark ? (v || "") : formatCell(v, c.format, currency)}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
