"use client";

import Link from "next/link";
import { Banknote, Download, FileText, Percent, Users } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { OptionSelect } from "@/components/common/option-select";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { AmountColumnChart, ChartCard, RankedBarChart } from "@/components/charts/charts";
import { useUrlState } from "@/components/data/use-url-state";
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";
import type { financeReport } from "@/server/modules/finance/report";
import { useShowMore } from "@/components/data/use-show-more";
import { DatePicker } from "@/components/common/date-pickers";

type Report = Awaited<ReturnType<typeof financeReport>>;

export function FinanceReportView({ report, classes, today, currency, canExport }: { report: Report; classes: { value: string; label: string }[]; today: string; currency: string; canExport: boolean }) {
  const { set } = useUrlState();
  const p = report.params;
  const t = report.totals;
  const money = (v: number) => formatMoney(v, currency);
  const more = useShowMore(report.owing.length, { max: 300 });
  const year = today.slice(0, 4);
  const presets = [
    { label: "This month", from: `${today.slice(0, 7)}-01` },
    { label: "This year", from: `${year}-01-01` },
    { label: "Last 12 months", from: `${Number(year) - 1}-${today.slice(5, 7)}-01` },
  ];
  const exportHref = (kind: "outstanding" | "classes", format: "csv" | "xlsx") => `/api/finance/report?${new URLSearchParams({ from: p.from, to: p.to, kind, format, ...(p.classId ? { classId: p.classId } : {}) })}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Finance reports"
        description={`${formatDate(p.from, "long")} – ${formatDate(p.to, "long")}`}
        actions={
          canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel className="text-caption text-muted-foreground">Outstanding fees by student</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <a href={exportHref("outstanding", "xlsx")}>Excel (.xlsx)</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={exportHref("outstanding", "csv")}>CSV</a>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-caption text-muted-foreground">Collection by class</DropdownMenuLabel>
                <DropdownMenuItem asChild>
                  <a href={exportHref("classes", "xlsx")}>Excel (.xlsx)</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={exportHref("classes", "csv")}>CSV</a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <div role="group" aria-label="Date range" className="flex gap-1 rounded-lg bg-muted p-1">
          {presets.map((pr) => (
            <button
              key={pr.label}
              type="button"
              aria-pressed={p.from === pr.from && p.to === today}
              onClick={() => set({ from: pr.from, to: today })}
              className={cn("rounded-md px-2.5 py-1 text-small font-medium", p.from === pr.from && p.to === today ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {pr.label}
            </button>
          ))}
        </div>
        <DatePicker ariaLabel="From" value={p.from} max={p.to} onChange={(v) => v && set({ from: v })} className="w-[10.5rem]" />
        <DatePicker ariaLabel="To" value={p.to} max={today} onChange={(v) => v && set({ to: v })} className="w-[10.5rem]" />
        <div className="w-48">
          <OptionSelect ariaLabel="Class" value={p.classId} onChange={(v) => set({ classId: v })} options={classes} noneLabel="All classes" />
        </div>
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Billed" value={money(t.billed)} hint={t.discounts ? `after ${money(t.discounts)} discounts` : "invoices issued in range"} icon={FileText} tone="primary" />
        <StatCard label="Received" value={money(t.received)} hint={`${formatNumber(t.payments)} payments`} icon={Banknote} tone="success" />
        <StatCard label="Collection rate" value={formatPercent(t.collectionRate, 1)} hint="of amounts billed in range" icon={Percent} tone={t.collectionRate !== null && t.collectionRate < 80 ? "warning" : "success"} />
        <StatCard label="Outstanding now" value={money(t.outstanding)} hint={`${formatNumber(t.owingStudents)} students`} icon={Users} tone={t.outstanding > 0 ? "warning" : "neutral"} />
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartCard title="How much came in each month?" description="Payments received" className="xl:col-span-3">
          <AmountColumnChart name="Received" data={report.monthly.map((m) => ({ label: m.label, value: m.amount }))} format={(v) => formatMoney(v, currency)} tickFormat={(v) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(v)} />
        </ChartCard>
        <ChartCard title="Which classes are behind?" description="Share of billed fees collected" className="xl:col-span-2">
          {report.classes.length === 0 ? (
            <p className="py-8 text-center text-small text-muted-foreground">Nothing billed in this range.</p>
          ) : (
            <RankedBarChart threshold={80} valueLabel="Collected" hintLabel="Outstanding" data={report.classes.filter((c) => c.rate !== null).map((c) => ({ id: c.id, label: c.name, value: c.rate!, hint: money(c.outstanding) }))} />
          )}
        </ChartCard>
      </div>

      <section aria-labelledby="owing-heading" className="rounded-xl border bg-card shadow-xs">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
          <h2 id="owing-heading" className="text-h3">
            Who owes fees
          </h2>
          <p className="text-small text-muted-foreground">Unpaid balances as of today, largest first</p>
        </header>
        {report.owing.length === 0 ? (
          <p className="px-5 py-10 text-center text-small text-muted-foreground">No outstanding balances. Every invoice is paid.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead className="bg-muted/60">
                <tr className="border-b text-caption text-muted-foreground">
                  <th scope="col" className="h-9 px-4 text-start font-medium">Student</th>
                  <th scope="col" className="h-9 px-4 text-start font-medium">Class</th>
                  <th scope="col" className="hidden h-9 px-4 text-start font-medium md:table-cell">Guardian</th>
                  <th scope="col" className="h-9 px-4 text-end font-medium">Invoices</th>
                  <th scope="col" className="hidden h-9 px-4 text-start font-medium sm:table-cell">Oldest due</th>
                  <th scope="col" className="h-9 px-4 text-end font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {report.owing.slice(0, more.shown).map((o) => (
                  <tr key={o.studentId} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/students/${o.studentId}?tab=fees`} className="font-medium hover:underline">
                        {o.name}
                      </Link>
                      <span className="block text-caption text-muted-foreground">{o.admissionNo}</span>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{o.className ?? "—"}</td>
                    <td className="hidden px-4 py-2.5 md:table-cell">
                      {o.guardian ?? "—"}
                      {o.phone && (
                        <a href={`tel:${o.phone}`} className="block text-caption text-muted-foreground hover:underline">
                          {o.phone}
                        </a>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-end tabular">
                      {o.invoices}
                      {o.overdue > 0 && <span className="block text-caption text-danger-foreground">{o.overdue} overdue</span>}
                    </td>
                    <td className="hidden px-4 py-2.5 whitespace-nowrap sm:table-cell">{formatDate(o.oldestDue)}</td>
                    <td className="px-4 py-2.5 text-end tabular font-semibold">{money(o.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {more.footer}
            {report.owing.length > 300 && <p className="px-5 py-3 text-caption text-muted-foreground">Showing the 300 largest balances. Export for the full list.</p>}
          </div>
        )}
      </section>
    </div>
  );
}
