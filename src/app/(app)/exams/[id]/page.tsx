import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { can, requirePageContext } from "@/server/auth/context";
import { examLookups, getExam } from "@/server/modules/exams/service";
import { AppError } from "@/server/http/errors";
import { ExamDetail } from "./exam-detail";

export const metadata: Metadata = { title: "Exam" };

export default async function ExamPage({ params, searchParams }: PageProps<"/exams/[id]">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "exams.view")) redirect("/forbidden");
  const { id } = await params;
  const { class: classParam } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const exam = await getExam(ctx, id).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!exam) notFound();
  const canManage = can(ctx, "exams.manage");
  return (
    <>
      <BreadcrumbLabel segment={id} label={exam.name} />
      <ExamDetail
        exam={exam}
        lookups={canManage ? await examLookups(ctx) : null}
        activeClassId={typeof classParam === "string" && exam.classes.some((c) => c.id === classParam) ? classParam : (exam.classes[0]?.id ?? null)}
        perms={{ manage: canManage, marks: can(ctx, "marks.enter"), publish: can(ctx, "results.publish"), results: can(ctx, "results.view") }}
      />
    </>
  );
}
