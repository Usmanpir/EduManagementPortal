import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { can, canAny, requirePageContext } from "@/server/auth/context";
import { examLookups, listExams } from "@/server/modules/exams/service";
import { todayIn } from "@/lib/format";
import { ExamsView } from "./exams-view";

export const metadata: Metadata = { title: "Exams" };

export default async function ExamsPage() {
  const ctx = await requirePageContext();
  if (!can(ctx, "exams.view")) {
    // Teachers without exam admin rights land on their marks list.
    if (canAny(ctx, "marks.enter")) redirect("/exams/marks");
    if (canAny(ctx, "results.view")) redirect("/exams/results");
    redirect("/forbidden");
  }
  const canManage = can(ctx, "exams.manage");
  const [exams, lookups] = await Promise.all([listExams(ctx), canManage ? examLookups(ctx) : null]);
  return <ExamsView exams={exams} lookups={lookups} today={todayIn(ctx.organization.timezone)} passPercentage={ctx.settings.exams.passPercentage} perms={{ manage: canManage, marks: can(ctx, "marks.enter"), results: can(ctx, "results.view") }} />;
}
