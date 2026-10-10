import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2, CalendarX2, ChevronLeft, ChevronRight, Clock3, Plane, Plus } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { STATUS_META, type StatusKey } from "@/components/attendance/status";
import { ChildSwitcher } from "@/components/portal/child-switcher";
import { NoStudent } from "@/components/portal/no-student";
import { myAttendance } from "@/server/modules/portal/service";
import { formatDate, formatNumber, formatPercent, isoWeekday, todayIn } from "@/lib/format";
import { portalPage } from "../portal-page";

export const metadata: Metadata = { title: "Attendance" };

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const shiftMonth = (month: string, by: number) => {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + by, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

export default async function MyAttendancePage({ searchParams }: PageProps<"/my/attendance">) {
  const { ctx, sp, students, student, isParent } = await portalPage(searchParams, "/attendance");
  if (!student) return <NoStudent isParent={isParent} />;
  const today = todayIn(ctx.organization.timezone);
  const thisMonth = today.slice(0, 7);
  const month = typeof sp.month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month) && sp.month <= thisMonth ? sp.month : thisMonth;
  const data = await myAttendance(ctx, student.id, month);
  const byDate = new Map(data.days.map((d) => [d.date, d]));
  const [y, m] = month.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = isoWeekday(`${month}-01`) - 1;
  const cells = [...Array.from({ length: lead }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`)];
  const q = (mm: string) => `?${new URLSearchParams({ student: student.id, month: mm })}`;
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const low = data.rate !== null && data.rate < data.threshold;

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-5">
      <PageHeader
        title="Attendance"
        description={`${student.name}${student.className ? ` · ${student.className}` : ""} · since ${formatDate(data.since, "long")}`}
        actions={
          <Button variant="outline" asChild>
            <Link href={`/my/leave?student=${student.id}`}>
              <Plus /> Request leave
            </Link>
          </Button>
        }
      />
      <ChildSwitcher students={students} selectedId={student.id} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Attendance" value={formatPercent(data.rate, 1)} hint={low ? `Below the school's ${data.threshold}% target` : `Target ${data.threshold}%`} icon={CalendarCheck2} tone={low ? "danger" : "success"} />
        <StatCard label="Days absent" value={formatNumber(data.counts.absent)} icon={CalendarX2} tone={data.counts.absent ? "danger" : "neutral"} />
        <StatCard label="Late arrivals" value={formatNumber(data.counts.late)} icon={Clock3} tone={data.counts.late ? "warning" : "neutral"} />
        <StatCard label="On leave" value={formatNumber(data.counts.leave)} icon={Plane} tone="info" />
      </div>

      <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-5" aria-labelledby="month-heading">
        <header className="mb-4 flex items-center justify-between gap-2">
          <h2 id="month-heading" className="text-h3">
            {monthLabel}
          </h2>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" asChild>
              <Link href={q(shiftMonth(month, -1))} aria-label="Previous month">
                <ChevronLeft className="rtl:rotate-180" />
              </Link>
            </Button>
            {month < thisMonth ? (
              <Button variant="outline" size="icon-sm" asChild>
                <Link href={q(shiftMonth(month, 1))} aria-label="Next month">
                  <ChevronRight className="rtl:rotate-180" />
                </Link>
              </Button>
            ) : (
              <Button variant="outline" size="icon-sm" disabled aria-label="Next month">
                <ChevronRight className="rtl:rotate-180" />
              </Button>
            )}
          </div>
        </header>
        {/* A visual calendar; each day carries its own spoken label, so the weekday row is decorative. */}
        <div className="grid grid-cols-7 gap-1 text-center" role="list" aria-label={`Attendance for ${monthLabel}`}>
          {WEEKDAYS.map((d, i) => (
            <div key={d} aria-hidden className={cn("pb-1 text-caption font-medium", data.offDays.includes(i + 1) ? "text-subtle-foreground" : "text-muted-foreground")}>
              {d}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`x${i}`} aria-hidden />;
            const rec = byDate.get(date);
            const meta = rec ? STATUS_META[rec.status as StatusKey] : null;
            const off = data.offDays.includes(isoWeekday(date));
            const future = date > today;
            return (
              <div
                key={date}
                role="listitem"
                title={rec ? `${formatDate(date, "weekday")}: ${meta?.label}${rec.note ? ` — ${rec.note}` : ""}` : undefined}
                className={cn(
                  "flex aspect-square flex-col items-center justify-center rounded-lg border text-small sm:aspect-[4/3]",
                  meta ? meta.active : off ? "border-transparent bg-muted/40 text-muted-foreground" : future ? "border-dashed text-subtle-foreground" : "bg-card text-muted-foreground",
                  date === today && "ring-2 ring-primary ring-offset-1 ring-offset-card",
                )}
              >
                <span className="tabular font-medium" aria-hidden>
                  {Number(date.slice(8))}
                </span>
                {meta && (
                  <span className="text-[0.625rem] leading-none font-semibold sm:text-caption" aria-hidden>
                    {meta.short}
                  </span>
                )}
                <span className="sr-only">
                  {formatDate(date, "weekday")}: {meta ? meta.label : off ? "weekly holiday" : future ? "upcoming" : "not marked"}
                </span>
              </div>
            );
          })}
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground" aria-label="Legend">
          {(["PRESENT", "LATE", "ABSENT", "LEAVE"] as StatusKey[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", STATUS_META[k].dot)} aria-hidden /> {STATUS_META[k].short} = {STATUS_META[k].label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-muted" aria-hidden /> Weekly off
          </li>
        </ul>
      </section>

      {data.leave.length > 0 && (
        <section>
          <SectionHeader title="Recent leave" />
          <ul className="divide-y rounded-xl border bg-card shadow-xs">
            {data.leave.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-3 px-4 py-3 text-small">
                <span>
                  {formatDate(l.from)}
                  {l.to !== l.from && ` – ${formatDate(l.to)}`} · <span className="capitalize">{l.type.toLowerCase()}</span>
                </span>
                <Badge variant={l.status === "APPROVED" ? "success" : "warning"} dot>
                  {l.status === "APPROVED" ? "Approved" : "Pending"}
                </Badge>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
