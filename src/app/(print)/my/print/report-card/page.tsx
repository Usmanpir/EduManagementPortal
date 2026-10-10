import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ReportCardView } from "@/components/exams/report-card";
import { requirePageContext } from "@/server/auth/context";
import { AppError } from "@/server/http/errors";
import { myReportCard } from "@/server/modules/portal/service";

export const metadata: Metadata = { title: "Report card" };

/** A family's own child's published report card. */
export default async function MyReportCardPrint({ searchParams }: PageProps<"/my/print/report-card">) {
  const ctx = await requirePageContext();
  const { student, exam } = await searchParams;
  const uuid = /^[0-9a-f-]{36}$/i;
  if (typeof student !== "string" || typeof exam !== "string" || !uuid.test(student) || !uuid.test(exam)) notFound();
  const card = await myReportCard(ctx, student, exam).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!card) notFound();
  const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, address: true, phone: true, email: true } });
  return <ReportCardView card={card} organization={org} footer={ctx.settings.exams.reportCardFooter} />;
}
