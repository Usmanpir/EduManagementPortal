import type { Metadata } from "next";
import Link from "next/link";
import { CalendarCheck2, CalendarRange, CalendarX2, CheckCircle2, ChevronRight, Clock3, History, Plane, Users } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { DateNav } from "@/components/attendance/date-nav";
import { can, canAny, requirePageContext } from "@/server/auth/context";
import { attendanceOverview, type OverviewItem } from "@/server/modules/attendance/register";
import { formatDate, formatNumber, todayIn } from "@/lib/format";
import { redirect } from "next/navigation";

export const metadata: Metadata = { title: "Attendance" };

function RegisterCard({ item, date, canMark }: { item: OverviewItem; date: string; canMark: boolean }) {
  const href = `/attendance/mark/${item.sectionId}?${new URLSearchParams({ ...(date ? { date } : {}), ...(item.periodId ? { period: item.periodId } : {}) }).toString()}`;
  const total = item.counts.present + item.counts.absent + item.counts.late + item.counts.leave;
  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-xs transition-[border-color,box-shadow] outline-none hover:border-border-strong hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring",
          !item.submitted && "border-s-4 border-s-warning",
        )}
      >
        <span className={cn("grid size-10 shrink-0 place-items-center rounded-lg", item.submitted ? "bg-success-subtle text-success-foreground" : "bg-warning-subtle text-warning-foreground")}>
          {item.submitted ? <CheckCircle2 className="size-5" /> : <Clock3 className="size-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium group-hover:text-primary">
            {item.label}
            {item.subject && <span className="font-normal text-muted-foreground"> · {item.subject}</span>}
          </p>
          <p className="truncate text-small text-muted-foreground">
            {item.time ? `${item.time} · ` : ""}
            {item.students} students{item.classTeacher && !item.time ? ` · ${item.classTeacher}` : ""}
          </p>
        </div>
        {item.submitted ? (
          <div className="hidden text-end sm:block">
            <p className="tabular text-small font-medium">
              {item.counts.present + item.counts.late}/{total} present
            </p>
            <p className="text-caption text-muted-foreground">
              {item.counts.absent} absent · {item.counts.late} late
            </p>
          </div>
        ) : (
          canMark && (
            <Badge variant="warning" className="hidden sm:inline-flex">
              Not taken
            </Badge>
          )
        )}
        <ChevronRight className="size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
      </Link>
    </li>
  );
}

export default async function AttendancePage({ searchParams }: PageProps<"/attendance">) {
  const ctx = await requirePageContext();
  if (!canAny(ctx, "attendance.view", "attendance.mark")) {
    if (can(ctx, "staff_attendance.view")) redirect("/attendance/staff");
    redirect("/attendance/leave");
  }
  const today = todayIn(ctx.organization.timezone);
  const { date: raw } = await searchParams;
  const date = typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw) && raw <= today ? raw : today;
  const overview = await attendanceOverview(ctx, date);
  const { summary, items } = overview;
  const canMark = can(ctx, "attendance.mark");
  const mine = items.filter((i) => i.mine);
  const pending = items.filter((i) => !i.submitted && !i.mine);
  const done = items.filter((i) => i.submitted && !i.mine);
  const pendingCorrections = can(ctx, "attendance.edit") ? await ctx.db.attendanceCorrection.count({ where: { status: "PENDING" } }) : 0;
  const marked = summary.present + summary.absent + summary.late + summary.leave;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Attendance"
        description={date === today ? "Today's registers across your classes." : `Registers for ${formatDate(date, "weekday")}.`}
        actions={
          <>
            {pendingCorrections > 0 && (
              <Button variant="outline" asChild>
                <Link href="/attendance/corrections">
                  <History /> Corrections <Badge variant="warning">{pendingCorrections}</Badge>
                </Link>
              </Button>
            )}
            <DateNav date={date} today={today} />
          </>
        }
      />

      {overview.isOffDay && (
        <p className="rounded-lg border bg-muted px-3 py-2 text-small text-muted-foreground">
          {formatDate(date, "weekday")} is normally a day off. Registers can still be taken if school is open.
        </p>
      )}

      <section aria-label="Summary" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Present" value={formatNumber(summary.present + summary.late)} hint={marked ? `${Math.round(((summary.present + summary.late) / Math.max(1, summary.present + summary.late + summary.absent)) * 100)}% of marked students` : "No registers yet"} icon={CalendarCheck2} tone="success" />
        <StatCard label="Absent" value={formatNumber(summary.absent)} icon={CalendarX2} tone="danger" />
        <StatCard label="Late" value={formatNumber(summary.late)} icon={Clock3} tone="warning" />
        <StatCard label="On leave" value={formatNumber(summary.leave)} icon={Plane} tone="info" />
        <StatCard
          label="Registers taken"
          value={`${summary.submitted}/${summary.registers}`}
          hint={summary.registers - summary.submitted > 0 ? `${summary.registers - summary.submitted} still pending` : summary.registers ? "All registers taken" : undefined}
          icon={Users}
          tone={summary.registers && summary.submitted === summary.registers ? "success" : "neutral"}
          className="col-span-2 lg:col-span-1"
        />
      </section>

      {!overview.hasTimetable ? (
        <EmptyState
          icon={CalendarRange}
          title="No periods scheduled for this day"
          description="Your institution takes attendance per period. Build the timetable so each period's register appears here."
          actions={can(ctx, "timetable.manage") && <Button asChild><Link href="/academics/timetable">Open timetable</Link></Button>}
        />
      ) : items.length === 0 ? (
        <EmptyState icon={Users} title="No classes to show" description={can(ctx, "records.all") ? "Create classes and sections to start taking attendance." : "You aren't assigned to any classes yet. Ask your administrator to assign you as a class or subject teacher."} />
      ) : (
        <>
          {mine.length > 0 && (
            <section aria-labelledby="mine">
              <SectionHeader title={<span id="mine">Your classes</span>} description={mine.every((m) => m.submitted) ? "All done for this day." : "Tap a class to take its register."} />
              <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {mine.map((i) => (
                  <RegisterCard key={i.key} item={i} date={date === today ? "" : date} canMark={canMark} />
                ))}
              </ul>
            </section>
          )}
          {pending.length > 0 && (
            <section aria-labelledby="pending">
              <SectionHeader title={<span id="pending">Not taken yet</span>} description={`${pending.length} ${pending.length === 1 ? "register" : "registers"}`} />
              <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {pending.map((i) => (
                  <RegisterCard key={i.key} item={i} date={date === today ? "" : date} canMark={canMark} />
                ))}
              </ul>
            </section>
          )}
          {done.length > 0 && (
            <section aria-labelledby="done">
              <SectionHeader title={<span id="done">Completed</span>} description={`${done.length} ${done.length === 1 ? "register" : "registers"}`} />
              <ul className="grid grid-cols-1 gap-2 lg:grid-cols-2">
                {done.map((i) => (
                  <RegisterCard key={i.key} item={i} date={date === today ? "" : date} canMark={canMark} />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}
