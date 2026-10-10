"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { Calculator, Download, FileSpreadsheet, Printer } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/common/empty-state";
import { FormAlert } from "@/components/common/form-alert";
import { OptionSelect } from "@/components/common/option-select";
import { PageHeader } from "@/components/common/page-header";
import { StatCard } from "@/components/common/stat-card";
import { ResultBadge } from "@/components/exams/exam-ui";
import { useUrlState } from "@/components/data/use-url-state";
import { api, errorMessage } from "@/lib/api-client";
import { formatPercent } from "@/lib/format";
import { ordinal } from "@/lib/grading";
import type { sectionResults } from "@/server/modules/exams/results";

type Sheet = Awaited<ReturnType<typeof sectionResults>>;
type Option = { value: string; label: string };

export function ResultsView({ exams, sections, examId, sectionId, sheet, perms }: { exams: Option[]; sections: Option[]; examId: string | null; sectionId: string | null; sheet: Sheet | null; perms: { publish: boolean; export: boolean } }) {
  const router = useRouter();
  const { set } = useUrlState();
  const published = sheet?.exam.status === "PUBLISHED";

  const compute = async () => {
    try {
      toast.success((await api.post(`/api/exams/${examId}/results`)).message);
      router.refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const exportHref = (format: "csv" | "xlsx") => `/api/exams/${examId}/results?sectionId=${sectionId}&format=${format}`;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Results"
        description="Marks, totals, grades and class positions by section."
        actions={
          sheet && (
            <>
              {perms.publish && !published && (
                <Button variant="outline" onClick={compute}>
                  <Calculator /> {sheet.stats.computed ? "Recompute" : "Compute results"}
                </Button>
              )}
              {perms.export && (
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
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              {sheet.stats.computed && (
                <Button asChild>
                  <a href={`/exams/print/report-cards?exam=${examId}&section=${sectionId}`} target="_blank" rel="noreferrer">
                    <Printer /> Report cards
                  </a>
                </Button>
              )}
            </>
          )
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="w-full sm:w-72">
          <OptionSelect ariaLabel="Exam" value={examId} onChange={(v) => set({ exam: v, section: null })} options={exams} />
        </div>
        <div className="w-full sm:w-48">
          <OptionSelect ariaLabel="Section" value={sectionId} onChange={(v) => set({ section: v })} options={sections} />
        </div>
      </div>

      {!sheet ? (
        <EmptyState icon={FileSpreadsheet} title={exams.length ? "No sections to show" : "No exams yet"} description={exams.length ? "You don't have any sections in this exam." : "Results appear here once an exam has marks."} />
      ) : (
        <>
          {!sheet.stats.computed ? (
            <FormAlert variant="info">Results haven&apos;t been computed for this exam yet. {perms.publish ? "Compute them to see totals, grades and positions." : "They'll appear once an administrator computes them."}</FormAlert>
          ) : sheet.stats.stale && !published ? (
            <FormAlert variant="info">Marks have changed since results were last computed. {perms.publish ? "Recompute to update totals and positions." : ""}</FormAlert>
          ) : null}
          {!published && sheet.stats.computed && <p className="-mt-2 text-caption text-muted-foreground">Not yet visible to students and parents. Publish from the exam page.</p>}

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Passed" value={`${sheet.stats.pass}`} hint={`of ${sheet.rows.length} students`} tone="success" />
            <StatCard label="Failed" value={`${sheet.stats.fail}`} tone={sheet.stats.fail ? "danger" : "neutral"} />
            <StatCard label="Class average" value={formatPercent(sheet.stats.average, 1)} tone="primary" />
            <StatCard label="Incomplete" value={`${sheet.stats.incomplete}`} hint="missing marks" tone={sheet.stats.incomplete ? "warning" : "neutral"} />
          </div>

          <div className="overflow-x-auto rounded-xl border bg-card shadow-xs">
            <table className="w-full text-small">
              <thead className="bg-muted/50">
                <tr className="border-b text-caption text-muted-foreground">
                  <th scope="col" className="sticky start-0 h-10 bg-muted px-3 text-start font-medium">Student</th>
                  {sheet.papers.map((p) => (
                    <th key={p.id} scope="col" className="h-10 px-2 text-end font-medium whitespace-nowrap" title={`${p.subject} (out of ${p.maxMarks}, pass ${p.passMarks})`}>
                      {p.code}
                      <span className="block font-normal">/{p.maxMarks}</span>
                    </th>
                  ))}
                  <th scope="col" className="h-10 px-2 text-end font-medium">Total</th>
                  <th scope="col" className="h-10 px-2 text-end font-medium">%</th>
                  <th scope="col" className="h-10 px-2 text-center font-medium">Grade</th>
                  <th scope="col" className="h-10 px-2 text-end font-medium">Pos.</th>
                  <th scope="col" className="h-10 px-3 text-start font-medium">Result</th>
                  <th scope="col" className="h-10 px-2"><span className="sr-only">Report card</span></th>
                </tr>
              </thead>
              <tbody>
                {sheet.rows.map((r) => (
                  <tr key={r.studentId} className="border-b last:border-0">
                    <th scope="row" className="sticky start-0 bg-card px-3 py-2 text-start font-medium whitespace-nowrap">
                      <Link href={`/students/${r.studentId}`} className="hover:underline">
                        {r.name}
                      </Link>
                      <span className="block text-caption font-normal text-muted-foreground">Roll {r.rollNumber ?? "—"}</span>
                    </th>
                    {r.marks.map((m, i) => {
                      const p = sheet.papers[i]!;
                      const fail = m === "ABS" || (typeof m === "number" && m < p.passMarks);
                      return (
                        <td key={p.id} className={cn("px-2 py-2 text-end tabular", fail && "text-danger-foreground", m === null && "text-muted-foreground")}>
                          {m === null ? "—" : m}
                        </td>
                      );
                    })}
                    <td className="px-2 py-2 text-end tabular font-medium">{r.result ? r.result.total : "—"}</td>
                    <td className="px-2 py-2 text-end tabular">{r.result ? r.result.percentage.toFixed(1) : "—"}</td>
                    <td className="px-2 py-2 text-center font-semibold">{r.result?.grade ?? "—"}</td>
                    <td className="px-2 py-2 text-end tabular">{r.result?.position ? ordinal(r.result.position) : "—"}</td>
                    <td className="px-3 py-2">{r.result ? <ResultBadge status={r.result.status} /> : "—"}</td>
                    <td className="px-2 py-2">
                      {r.result && (
                        <Button variant="ghost" size="icon-sm" asChild>
                          <a href={`/exams/print/report-cards?exam=${examId}&student=${r.studentId}`} target="_blank" rel="noreferrer" aria-label={`Report card for ${r.name}`}>
                            <Printer />
                          </a>
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
