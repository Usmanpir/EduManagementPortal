import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CheckCircle2, ChevronRight, ClipboardList } from "lucide-react";
import { cn } from "cn";
import { Progress } from "@/components/ui/progress";
import { EmptyState } from "@/components/common/empty-state";
import { PageHeader, SectionHeader } from "@/components/common/page-header";
import { can, requirePageContext } from "@/server/auth/context";
import { myPapers } from "@/server/modules/exams/marks";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Enter marks" };

export default async function MarksPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "marks.enter")) redirect("/forbidden");
  const papers = await myPapers(ctx);
  const exams = [...new Map(papers.map((p) => [p.examId, p.exam])).entries()];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Enter marks" description="Papers you can mark, by exam. Published exams are locked." />
      {papers.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nothing to mark" description="When an exam includes a subject you teach, its papers show up here." />
      ) : (
        exams.map(([examId, name]) => {
          const mine = papers.filter((p) => p.examId === examId);
          const done = mine.filter((p) => p.students > 0 && p.entered >= p.students).length;
          return (
            <section key={examId}>
              <SectionHeader title={name} description={`${done} of ${mine.length} papers complete`} />
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {mine.map((p) => {
                  const complete = p.students > 0 && p.entered >= p.students;
                  const pct = p.students ? Math.round((p.entered / p.students) * 100) : 0;
                  return (
                    <li key={`${p.examSubjectId}:${p.sectionId}`}>
                      <Link
                        href={`/exams/marks/${p.examSubjectId}?section=${p.sectionId}`}
                        className={cn("group flex items-center gap-3 rounded-xl border bg-card p-4 shadow-xs outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring", !complete && p.entered === 0 && "border-s-4 border-s-warning")}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="flex items-center gap-1.5 truncate font-medium group-hover:text-primary">
                            {complete && <CheckCircle2 className="size-4 text-success" aria-label="Complete" />}
                            {p.subject} · {p.section}
                          </p>
                          <p className="mb-2 text-caption text-muted-foreground">
                            {p.date ? formatDate(p.date, "weekday") : "Date not set"} · {p.entered}/{p.students} marked
                          </p>
                          <Progress value={pct} aria-label={`${pct}% marked`} />
                        </div>
                        <ChevronRight className="size-4 text-muted-foreground rtl:rotate-180" />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
