"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarCheck2, CalendarX2, Clock3, Download, TrendingDown, Users } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/common/empty-state";
import { OptionSelect } from "@/components/common/option-select";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, RankedBarChart, RateTrendChart } from "@/components/charts/charts";
import { AttendanceMeter } from "@/components/people/attendance-meter";
import type { PeopleLookups } from "@/components/people/types";
import { useUrlState } from "@/components/data/use-url-state";
import { addDays, formatDate, formatNumber, formatPercent } from "@/lib/format";
import type { attendanceReport } from "@/server/modules/attendance/report";
import { useShowMore } from "@/components/data/use-show-more";
import { DatePicker } from "@/components/common/date-pickers";

type Report = Awaited<ReturnType<typeof attendanceReport>>;

const PRESETS = [
  { key: "7", label: "Last 7 days", days: 6 },
  { key: "30", label: "Last 30 days", days: 29 },
  { key: "90", label: "Last 90 days", days: 89 },
];

export function ReportView({ report, lookups, today, threshold, canExport }: { report: Report; lookups: PeopleLookups; today: string; threshold: number; canExport: boolean }) {
  const { set, searchParams } = useUrlState();
  const [view, setView] = useState<"low" | "late" | "all">("low");
  const p = report.params;
  const classes = [...new Map(lookups.sections.map((s) => [s.classId, { value: s.classId, label: s.className }])).values()];
  const sections = lookups.sections.filter((s) => !p.classId || s.classId === p.classId).map((s) => ({ value: s.id, label: s.label }));
  const activePreset = PRESETS.find((pr) => p.to === today && p.from === addDays(today, -pr.days))?.key;

  const students = useMemo(() => {
    if (view === "low") return report.students.filter((s) => s.rate !== null && s.rate < threshold);
    if (view === "late") return [...report.students].filter((s) => s.counts.late > 0).sort((a, b) => b.counts.late - a.counts.late);
    return report.students;
  }, [report.students, view, threshold]);
  const lowCount = report.students.filter((s) => s.rate !== null && s.rate < threshold).length;
  const more = useShowMore(students.length, { max: 300 });

  const exportHref = (format: "csv" | "xlsx") => {
    const q = new URLSearchParams({ from: p.from, to: p.to, format });
    if (p.classId) q.set("classId", p.classId);
    if (p.sectionId) q.set("sectionId", p.sectionId);
    return `/api/attendance/report?${q}`;
  };

  const t = report.totals;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance reports"
        description={`${formatDate(p.from, "long")} – ${formatDate(p.to, "long")} · ${t.schoolDays} school days`}
        actions={
          canExport && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Download /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <a href={exportHref("xlsx")}>Excel (.xlsx)</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <a href={exportHref("csv")}>CSV</a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/reports/print/attendance?${new URLSearchParams({ from: p.from, to: p.to, ...(p.classId ? { classId: p.classId } : {}), ...(p.sectionId ? { sectionId: p.sectionId } : {}) })}`} target="_blank">
                    PDF (print view)
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        }
      />

      <div className="flex flex-wrap items-end gap-2">
        <div role="group" aria-label="Date range" className="flex gap-1 rounded-lg bg-muted p-1">
          {PRESETS.map((pr) => (
            <button
              key={pr.key}
              type="button"
              aria-pressed={activePreset === pr.key}
              onClick={() => set({ from: addDays(today, -pr.days), to: today })}
              className={cn("rounded-md px-2.5 py-1 text-small font-medium", activePreset === pr.key ? "bg-card shadow-xs" : "text-muted-foreground hover:text-foreground")}
            >
              {pr.label}
            </button>
          ))}
        </div>
        <DatePicker ariaLabel="From" value={p.from} max={p.to} onChange={(v) => v && set({ from: v })} className="w-[10.5rem]" />
        <DatePicker ariaLabel="To" value={p.to} max={today} onChange={(v) => v && set({ to: v })} className="w-[10.5rem]" />
        <div className="w-44">
          <OptionSelect ariaLabel="Class" value={p.classId ?? null} onChange={(v) => set({ classId: v, sectionId: null })} options={classes} noneLabel="All classes" />
        </div>
        <div className="w-48">
          <OptionSelect ariaLabel="Section" value={p.sectionId ?? null} onChange={(v) => set({ sectionId: v })} options={sections} noneLabel="All sections" />
        </div>
        {(searchParams.get("classId") || searchParams.get("sectionId")) && (
          <Button variant="link" size="sm" onClick={() => set({ classId: null, sectionId: null })}>
            Clear
          </Button>
        )}
      </div>

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Attendance rate" value={formatPercent(t.rate, 1)} hint={`Target ${threshold}%`} icon={CalendarCheck2} tone={t.rate !== null && t.rate < threshold ? "danger" : "success"} />
        <StatCard label="Absences" value={formatNumber(t.absent)} icon={CalendarX2} tone="danger" />
        <StatCard label="Late arrivals" value={formatNumber(t.late)} icon={Clock3} tone="warning" />
        <StatCard label="Below target" value={formatNumber(lowCount)} hint="students" icon={TrendingDown} tone={lowCount ? "warning" : "neutral"} />
        <StatCard label="Students" value={formatNumber(t.students)} icon={Users} tone="neutral" className="col-span-2 lg:col-span-1" />
      </section>

      {report.trend.length === 0 ? (
        <EmptyState icon={CalendarCheck2} title="No attendance in this range" description="Choose a different date range or class." />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
          <ChartCard title="Is attendance improving?" description="Daily attendance rate (present + late)" className="xl:col-span-3">
            <RateTrendChart
              target={threshold}
              data={report.trend.map((d) => ({
                label: formatDate(d.date, "dayMonth"),
                rate: d.rate,
                detail: [
                  { label: "Absent", value: String(d.absent) },
                  { label: "Late", value: String(d.late) },
                ],
              }))}
            />
          </ChartCard>
          <ChartCard title="Which sections need attention?" description="Attendance rate by section, lowest first" className="xl:col-span-2">
            <RankedBarChart
              threshold={threshold}
              data={report.sections
                .filter((s) => s.rate !== null)
                .sort((a, b) => a.rate! - b.rate!)
                .map((s) => ({ id: s.id, label: s.label, value: s.rate!, hint: String(s.students) }))}
            />
          </ChartCard>
        </div>
      )}

      <section aria-labelledby="students-heading" className="rounded-xl border bg-card shadow-xs">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5">
          <h2 id="students-heading" className="text-h3">
            Students
          </h2>
          <div role="tablist" className="flex gap-1 rounded-lg bg-muted p-1">
            {(
              [
                ["low", `Below ${threshold}% (${lowCount})`],
                ["late", "Most late"],
                ["all", "Everyone"],
              ] as const
            ).map(([key, label]) => (
              <button key={key} role="tab" type="button" aria-selected={view === key} onClick={() => setView(key)} className={cn("rounded-md px-2.5 py-1 text-small font-medium", view === key ? "bg-card shadow-xs" : "text-muted-foreground")}>
                {label}
              </button>
            ))}
          </div>
        </header>
        {students.length === 0 ? (
          <p className="px-5 py-10 text-center text-small text-muted-foreground">{view === "low" ? `Everyone is at or above ${threshold}%.` : "No students to show."}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-small">
              <thead className="bg-muted/60">
                <tr className="border-b text-caption text-muted-foreground">
                  <th scope="col" className="h-9 px-4 text-start font-medium">Student</th>
                  <th scope="col" className="h-9 px-4 text-start font-medium">Class</th>
                  <th scope="col" className="h-9 px-4 text-end font-medium">Present</th>
                  <th scope="col" className="h-9 px-4 text-end font-medium">Late</th>
                  <th scope="col" className="h-9 px-4 text-end font-medium">Absent</th>
                  <th scope="col" className="h-9 px-4 text-end font-medium">Leave</th>
                  <th scope="col" className="h-9 px-4 text-start font-medium">Rate</th>
                </tr>
              </thead>
              <tbody>
                {students.slice(0, more.shown).map((s) => (
                  <tr key={s.studentId} className="border-b last:border-0">
                    <td className="px-4 py-2.5">
                      <Link href={`/students/${s.studentId}`} className="font-medium hover:underline">
                        {s.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5 text-muted-foreground">{s.section ?? "—"}</td>
                    <td className="px-4 py-2.5 text-end tabular">{s.counts.present}</td>
                    <td className="px-4 py-2.5 text-end tabular">{s.counts.late}</td>
                    <td className="px-4 py-2.5 text-end tabular">{s.counts.absent}</td>
                    <td className="px-4 py-2.5 text-end tabular">{s.counts.leave}</td>
                    <td className="px-4 py-2.5">
                      <AttendanceMeter rate={s.rate} threshold={threshold} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {more.footer}
          </div>
        )}
      </section>
    </div>
  );
}
