import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, requirePageContext } from "@/server/auth/context";
import { resultSections, sectionResults } from "@/server/modules/exams/results";
import { examScope } from "@/server/modules/exams/service";
import { ResultsView } from "./results-view";

export const metadata: Metadata = { title: "Results" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function ResultsPage({ searchParams }: PageProps<"/exams/results">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "results.view")) redirect("/forbidden");
  const sp = await searchParams;
  const exams = await ctx.db.exam.findMany({ where: { AND: [examScope(ctx), { subjects: { some: {} } }] }, select: { id: true, name: true, status: true }, orderBy: [{ startDate: "desc" }] });
  const examId = typeof sp.exam === "string" && exams.some((e) => e.id === sp.exam) ? sp.exam : (exams[0]?.id ?? null);
  const sections = examId ? await resultSections(ctx, examId) : [];
  const sectionId = typeof sp.section === "string" && UUID.test(sp.section) && sections.some((s) => s.value === sp.section) ? sp.section : (sections[0]?.value ?? null);
  const sheet = examId && sectionId ? await sectionResults(ctx, examId, sectionId) : null;
  return (
    <ResultsView
      exams={exams.map((e) => ({ value: e.id, label: `${e.name}${e.status === "PUBLISHED" ? "" : " (not published)"}` }))}
      sections={sections}
      examId={examId}
      sectionId={sectionId}
      sheet={sheet}
      perms={{ publish: can(ctx, "results.publish"), export: can(ctx, "reports.export") }}
    />
  );
}
