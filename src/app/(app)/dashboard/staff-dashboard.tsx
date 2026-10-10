import Link from "next/link";
import { AlertTriangle, Banknote, CalendarCheck2, CalendarX2, ChevronRight, ClipboardList, Clock3, FileText, GraduationCap, IdCard, Library, Megaphone, NotebookPen, Plane, Presentation, Wallet } from "lucide-react";
import { cn } from "cn";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/common/relative-time";
import { SectionHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ChartCard, RateTrendChart } from "@/components/charts/charts";
import type { staffDashboard } from "@/server/modules/dashboard/service";
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format";

type Data = Awaited<ReturnType<typeof staffDashboard>>;

function Panel({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col rounded-xl border bg-card shadow-xs", className)}>
      <header className="flex items-center justify-between gap-2 px-5 pt-4 pb-2">
        <h2 className="text-h3">{title}</h2>
        {action}
      </header>
      <div className="flex-1 pb-2">{children}</div>
    </section>
  );
}

export function StaffDashboard({ d, currency, threshold, nowMinute, perms }: { d: Data; currency: string; threshold: number; nowMinute: number; perms: Record<string, boolean> }) {
  const a = d.attendance;
  const money = (v: number) => formatMoney(v, currency);
  const registerHref = (r: { sectionId: string; periodId: string | null }) => `/attendance/mark/${r.sectionId}${r.periodId ? `?period=${r.periodId}` : ""}`;
  const todos = [
    a && a.registers - a.submitted > 0 && !a.isOffDay && { href: "/attendance", icon: ClipboardList, label: `${a.registers - a.submitted} register${a.registers - a.submitted === 1 ? "" : "s"} not taken yet` },
    d.pendingLeave && { href: "/attendance/leave?status=PENDING", icon: Plane, label: `${d.pendingLeave} leave request${d.pendingLeave === 1 ? "" : "s"} to review` },
    d.pendingCorrections && { href: "/attendance/corrections", icon: CalendarCheck2, label: `${d.pendingCorrections} attendance correction${d.pendingCorrections === 1 ? "" : "s"} to review` },
    d.marks && d.marks.incomplete > 0 && { href: "/exams/marks", icon: NotebookPen, label: `${d.marks.incomplete} paper${d.marks.incomplete === 1 ? "" : "s"} still need marks` },
    d.finance && d.finance.overdueCount > 0 && { href: "/finance/invoices?status=OVERDUE", icon: AlertTriangle, label: `${formatNumber(d.finance.overdueCount)} overdue fee invoices` },
  ].filter(Boolean) as { href: string; icon: typeof Plane; label: string }[];

  return (
    <div className="flex flex-col gap-6">
      {a && (
        <section aria-labelledby="today-heading">
          <SectionHeader title={<span id="today-heading">Today</span>} />
          {a.isOffDay ? (
            <p className="rounded-xl border bg-card p-4 text-small text-muted-foreground">Today is a weekly holiday — no registers are expected.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatCard label="Attendance today" value={formatPercent(a.rate, 1)} hint={a.submitted ? `${formatNumber(a.present)} of ${formatNumber(a.present + a.absent)} marked present` : "No registers yet"} icon={CalendarCheck2} tone={a.rate !== null && a.rate < threshold ? "danger" : "success"} href="/attendance" />
              <StatCard label="Absent" value={formatNumber(a.absent)} icon={CalendarX2} tone={a.absent ? "danger" : "neutral"} href="/attendance" />
              <StatCard label="Late" value={formatNumber(a.late)} icon={Clock3} tone={a.late ? "warning" : "neutral"} />
              <StatCard label="Registers taken" value={`${a.submitted}/${a.registers}`} icon={ClipboardList} tone={a.submitted < a.registers ? "warning" : "success"} href="/attendance" />
            </div>
          )}
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {todos.length > 0 && (
          <Panel title="Needs your attention">
            <ul className="divide-y">
              {todos.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
                    <span className="grid size-8 place-items-center rounded-lg bg-warning-subtle text-warning-foreground">
                      <t.icon className="size-4" aria-hidden />
                    </span>
                    <span className="flex-1 text-small font-medium">{t.label}</span>
                    <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {d.lessons && (
          <Panel title="Your lessons today" action={<Link href="/academics/timetable" className="text-small font-medium text-primary hover:underline">Timetable</Link>}>
            {d.lessons.length === 0 ? (
              <p className="px-5 py-3 text-small text-muted-foreground">No lessons on your timetable today.</p>
            ) : (
              <ol className="divide-y">
                {d.lessons.map((l) => {
                  const now = nowMinute >= l.startMinute && nowMinute < l.endMinute;
                  const done = nowMinute >= l.endMinute;
                  return (
                    <li key={l.id} className={cn("flex items-center gap-3 px-5 py-2.5", now && "bg-primary-subtle/40", done && "opacity-60")}>
                      <span className="w-12 shrink-0 text-caption tabular text-muted-foreground">{l.start}</span>
                      <span className="w-1 self-stretch rounded-full" style={{ background: l.color ?? "var(--chart-1)" }} aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-medium">
                          {l.subject} · {l.section}
                        </span>
                        <span className="block text-caption text-muted-foreground">
                          {l.start}–{l.end}
                          {l.room ? ` · ${l.room}` : ""}
                        </span>
                      </span>
                      {now && <Badge variant="primary">Now</Badge>}
                      {a?.mode === "PERIOD" && (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={registerHref({ sectionId: l.sectionId, periodId: l.periodId })}>Register</Link>
                        </Button>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Panel>
        )}

        {a && !a.isOffDay && a.pending.length > 0 && (
          <Panel title="Registers to take" action={<Link href="/attendance" className="text-small font-medium text-primary hover:underline">All registers</Link>}>
            <ul className="divide-y">
              {a.pending.map((r) => (
                <li key={r.key}>
                  <Link href={registerHref(r)} className="flex items-center gap-3 px-5 py-2.5 hover:bg-muted/40">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-medium">{r.label}</span>
                      <span className="block text-caption text-muted-foreground">
                        {[r.time, r.subject, `${r.students} students`].filter(Boolean).join(" · ")}
                      </span>
                    </span>
                    <span className="text-small font-medium text-primary">Take register</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {d.finance && (
          <Panel title="Fees" action={<Link href="/finance" className="text-small font-medium text-primary hover:underline">Finance</Link>}>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-5 py-2">
              {[
                ["Collected today", money(d.finance.today.amount), Banknote],
                ["This month", money(d.finance.month), Wallet],
                ["Outstanding", money(d.finance.outstanding), FileText],
                ["Overdue", money(d.finance.overdue), AlertTriangle],
              ].map(([k, v, Icon]) => {
                const I = Icon as typeof Wallet;
                return (
                  <div key={k as string}>
                    <dt className="flex items-center gap-1.5 text-caption text-muted-foreground">
                      <I className="size-3.5" aria-hidden /> {k as string}
                    </dt>
                    <dd className="tabular text-h3">{v as string}</dd>
                  </div>
                );
              })}
            </dl>
          </Panel>
        )}

        {d.nextExam && (
          <Panel title="Next exam">
            <Link href={`/exams/${d.nextExam.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40">
              <span className="grid size-10 place-items-center rounded-lg bg-primary-subtle text-primary-subtle-foreground">
                <NotebookPen className="size-5" aria-hidden />
              </span>
              <span className="flex-1">
                <span className="block font-medium">{d.nextExam.name}</span>
                <span className="block text-small text-muted-foreground">
                  {formatDate(d.nextExam.from, "long")} – {formatDate(d.nextExam.to, "long")}
                  {d.nextExam.draft && " · date sheet not published"}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
            </Link>
          </Panel>
        )}

        {d.announcements && d.announcements.length > 0 && (
          <Panel title="Announcements" action={<Link href="/communication/announcements" className="text-small font-medium text-primary hover:underline">All</Link>}>
            <ul className="divide-y">
              {d.announcements.map((n) => (
                <li key={n.id}>
                  <Link href={`/communication/announcements?id=${n.id}`} className="flex items-start gap-3 px-5 py-2.5 hover:bg-muted/40">
                    <Megaphone className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-medium">{n.title}</span>
                      {n.publishedAt && <RelativeTime date={n.publishedAt} className="text-caption text-muted-foreground" />}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>

      {d.trend && d.trend.length > 1 && (
        <ChartCard title="Is attendance holding up?" description="Daily attendance rate, last 14 school days">
          <RateTrendChart target={threshold} data={d.trend.map((t) => ({ label: formatDate(t.date, "dayMonth"), rate: t.rate, detail: [{ label: "Absent", value: String(t.absent) }] }))} />
        </ChartCard>
      )}

      {d.counts && (
        <section aria-labelledby="overview-heading">
          <SectionHeader title={<span id="overview-heading">Institution overview</span>} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Active students" value={formatNumber(d.counts.students)} icon={GraduationCap} tone="primary" href={perms.students ? "/students" : undefined} />
            <StatCard label="Teachers" value={formatNumber(d.counts.teachers)} icon={Presentation} tone="info" href={perms.teachers ? "/teachers" : undefined} />
            <StatCard label="Staff members" value={formatNumber(d.counts.staff)} icon={IdCard} tone="neutral" href={perms.staff ? "/staff" : undefined} />
            <StatCard label="Classes" value={formatNumber(d.counts.classes)} icon={Library} tone="success" href={perms.academics ? "/academics/classes" : undefined} />
          </div>
        </section>
      )}
    </div>
  );
}
