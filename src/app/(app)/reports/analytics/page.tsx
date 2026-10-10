import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarCheck2, FileSpreadsheet, GraduationCap, Percent } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { ChartCard, RankedBarChart, RateTrendChart } from "@/components/charts/charts";
import { can, requirePageContext } from "@/server/auth/context";
import { analytics } from "@/server/modules/reports/analytics";
import { formatNumber, formatPercent } from "@/lib/format";
import { CollectionsByMonth } from "./collections-chart";

export const metadata: Metadata = { title: "Analytics" };

export default async function AnalyticsPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "reports.view")) redirect("/forbidden");
  const a = await analytics(ctx);
  const latestRate = a.attendance?.monthly.filter((m) => m.rate !== null).at(-1)?.rate ?? null;

  return (
    <div className="flex flex-col gap-6">
      <BreadcrumbLabel segment="analytics" label="Analytics" />
      <PageHeader title="Analytics" description={`The last six months: ${a.months[0]} – ${a.months.at(-1)}.`} />
      <section aria-label="Headlines" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {a.attendance && <StatCard label="Attendance this month" value={formatPercent(latestRate, 1)} hint={`Target ${a.threshold}%`} icon={CalendarCheck2} tone={latestRate !== null && latestRate < a.threshold ? "danger" : "success"} href="/reports/attendance-students" />}
        {a.fees && <StatCard label="Fee collection rate" value={formatPercent(a.fees.collectionRate, 1)} hint="of invoices issued in 6 months" icon={Percent} tone="primary" href="/reports/fee-by-class" />}
        {a.exams && <StatCard label="Pass rate, latest exam" value={formatPercent(a.exams.passRate, 1)} hint={a.exams.exam} icon={FileSpreadsheet} tone="info" href="/reports/exam-subjects" />}
        {a.enrollment && <StatCard label="Active students" value={formatNumber(a.enrollment.total)} icon={GraduationCap} tone="neutral" href="/reports/enrollment" />}
      </section>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {a.attendance && (
          <ChartCard title="Is attendance improving?" description="Monthly attendance rate">
            <RateTrendChart target={a.threshold} data={a.attendance.monthly} />
          </ChartCard>
        )}
        {a.fees && (
          <ChartCard title="How much fee came in each month?" description="Payments received">
            <CollectionsByMonth data={a.fees.monthly} currency={ctx.organization.currency} />
          </ChartCard>
        )}
        {a.attendance && a.attendance.byClass.length > 0 && (
          <ChartCard title="Which classes attend least?" description="Attendance rate, this month and last, lowest first">
            <RankedBarChart threshold={a.threshold} data={a.attendance.byClass} />
          </ChartCard>
        )}
        {a.exams && a.exams.byClass.length > 0 && (
          <ChartCard title="Where are students struggling?" description={`Pass rate by class · ${a.exams.exam}`}>
            <RankedBarChart valueLabel="Passed" hintLabel="Students" data={a.exams.byClass} />
          </ChartCard>
        )}
        {a.enrollment && a.enrollment.byClass.length > 0 && (
          <ChartCard title="How are students spread across classes?" description="Active students per class" className="xl:col-span-2">
            <RankedBarChart unit="" max={Math.max(...a.enrollment.byClass.map((c) => c.value), 1)} valueLabel="Students" data={a.enrollment.byClass} />
          </ChartCard>
        )}
      </div>
    </div>
  );
}
