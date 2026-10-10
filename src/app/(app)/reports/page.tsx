import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarCheck2, ChartColumn, ChevronRight, FileSpreadsheet, GraduationCap, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { can, requirePageContext } from "@/server/auth/context";
import { REPORTS } from "@/lib/reports";

export const metadata: Metadata = { title: "Reports" };

const ICONS = { Attendance: CalendarCheck2, Finance: Wallet, Exams: FileSpreadsheet, "Students & staff": GraduationCap } as const;

export default async function ReportsPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "reports.view")) redirect("/forbidden");
  const available = REPORTS.filter((r) => can(ctx, ...r.permissions));
  const categories = [...new Set(available.map((r) => r.category))];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Reports"
        description="Choose a report, set the filters, preview it, then export to Excel or CSV, or print."
        actions={
          <Button variant="outline" asChild>
            <Link href="/reports/analytics">
              <ChartColumn /> Analytics
            </Link>
          </Button>
        }
      />
      {categories.map((cat) => {
        const Icon = ICONS[cat];
        return (
          <section key={cat} aria-labelledby={`cat-${cat}`}>
            <SectionHeader title={<span id={`cat-${cat}`} className="inline-flex items-center gap-2"><Icon className="size-4 text-muted-foreground" aria-hidden /> {cat}</span>} />
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {available
                .filter((r) => r.category === cat)
                .map((r) => (
                  <li key={r.key}>
                    <Link href={`/reports/${r.key}`} className="group flex h-full items-start gap-3 rounded-xl border bg-card p-4 shadow-xs outline-none hover:border-border-strong hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring">
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium group-hover:text-primary">{r.title}</span>
                        <span className="mt-0.5 block text-small text-muted-foreground">{r.description}</span>
                      </span>
                      <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground rtl:rotate-180" />
                    </Link>
                  </li>
                ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
