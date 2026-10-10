import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportCardView } from "@/components/exams/report-card";
import { requirePageContext } from "@/server/auth/context";
import { auditFor } from "@/server/audit";
import { AppError } from "@/server/http/errors";
import { reportCards } from "@/server/modules/exams/results";

export const metadata: Metadata = { title: "Report cards" };

const UUID = /^[0-9a-f-]{36}$/i;
const id = (v: unknown) => (typeof v === "string" && UUID.test(v) ? v : null);

export default async function PrintReportCards({ searchParams }: PageProps<"/exams/print/report-cards">) {
  const ctx = await requirePageContext("results.view");
  const sp = await searchParams;
  const examId = id(sp.exam);
  const sectionId = id(sp.section);
  const studentId = id(sp.student);
  if (!examId || (!sectionId && !studentId)) notFound();
  const cards = await reportCards(ctx, examId, studentId ? { studentIds: [studentId] } : { sectionId: sectionId! }).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!cards?.length) notFound();
  const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, address: true, phone: true, email: true } });
  await auditFor(ctx)({ action: "report.export", entityType: "report", metadata: { report: "report-cards", examId, sectionId, studentId, count: cards.length } });

  return (
    <div className="flex flex-col">
      {cards.map((c, i) => (
        <section key={c.studentId} className={i ? "mt-10 border-t pt-10 print:mt-0 print:break-before-page print:border-0 print:pt-0" : undefined}>
          <ReportCardView card={c} organization={org} footer={ctx.settings.exams.reportCardFooter} />
        </section>
      ))}
    </div>
  );
}
