import type { Metadata } from "next";
import Link from "next/link";
import { FileText, Printer } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader } from "@/components/common/page-header";
import { EXAM_TYPE_LABELS, ResultBadge } from "@/components/exams/exam-ui";
import { ReportCardView } from "@/components/exams/report-card";
import { ChildSwitcher } from "@/components/portal/child-switcher";
import { NoStudent } from "@/components/portal/no-student";
import { myReportCard, myResults } from "@/server/modules/portal/service";
import { formatDate } from "@/lib/format";
import { ordinal } from "@/lib/grading";
import { portalPage } from "../portal-page";

export const metadata: Metadata = { title: "Results" };

export default async function MyResultsPage({ searchParams }: PageProps<"/my/results">) {
  const { ctx, sp, students, student, isParent } = await portalPage(searchParams, "/exams/results");
  if (!student) return <NoStudent isParent={isParent} />;
  const results = await myResults(ctx, student.id);
  const examId = typeof sp.exam === "string" && results.some((r) => r.examId === sp.exam) ? sp.exam : (results[0]?.examId ?? null);
  const [card, org] = examId
    ? await Promise.all([myReportCard(ctx, student.id, examId), ctx.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, address: true, phone: true, email: true } })])
    : [null, null];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <PageHeader title="Results" description={`${student.name}${student.className ? ` · ${student.className}` : ""}`} />
      <ChildSwitcher students={students} selectedId={student.id} />
      {results.length === 0 ? (
        <EmptyState icon={FileText} title="No results yet" description="Results appear here as soon as the school publishes them. You'll also get a notification." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[18rem_1fr]">
          <ul className="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible" aria-label="Exams">
            {results.map((r) => (
              <li key={r.examId} className="min-w-56 lg:min-w-0">
                <Link
                  href={`?${new URLSearchParams({ student: student.id, exam: r.examId })}`}
                  aria-current={r.examId === examId ? "true" : undefined}
                  className={cn("block rounded-xl border bg-card p-3 shadow-xs outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring", r.examId === examId && "border-primary ring-1 ring-primary")}
                >
                  <p className="font-medium">{r.exam}</p>
                  <p className="text-caption text-muted-foreground">
                    {EXAM_TYPE_LABELS[r.type]} · {formatDate(r.from)}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="tabular text-h3">
                      {r.percentage.toFixed(1)}% <span className="text-small font-semibold">{r.grade}</span>
                    </span>
                    <span className="flex items-center gap-2 text-caption text-muted-foreground">
                      {r.position && ordinal(r.position)}
                      <ResultBadge status={r.status} />
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
          {card && org && (
            <section className="rounded-xl border bg-card p-4 shadow-xs sm:p-6" aria-label="Report card">
              <div className="mb-3 flex justify-end">
                <Button variant="outline" size="sm" asChild>
                  <a href={`/my/print/report-card?${new URLSearchParams({ student: student.id, exam: card.exam.id })}`} target="_blank" rel="noreferrer">
                    <Printer /> Print / save PDF
                  </a>
                </Button>
              </div>
              <div className="overflow-x-auto">
                <ReportCardView card={card} organization={org} footer={ctx.settings.exams.reportCardFooter} />
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
