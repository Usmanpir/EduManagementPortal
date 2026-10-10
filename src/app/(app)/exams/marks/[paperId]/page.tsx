import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { BreadcrumbLabel } from "@/components/shell/shell-context";
import { can, requirePageContext } from "@/server/auth/context";
import { AppError } from "@/server/http/errors";
import { getMarksSheet } from "@/server/modules/exams/marks";
import { MarksEntry } from "./marks-entry";

export const metadata: Metadata = { title: "Marks" };

const UUID = /^[0-9a-f-]{36}$/i;

export default async function MarksEntryPage({ params, searchParams }: PageProps<"/exams/marks/[paperId]">) {
  const ctx = await requirePageContext();
  if (!can(ctx, "marks.enter")) redirect("/forbidden");
  const { paperId } = await params;
  const { section } = await searchParams;
  if (!UUID.test(paperId) || typeof section !== "string" || !UUID.test(section)) notFound();
  const sheet = await getMarksSheet(ctx, paperId, section).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    if (e instanceof AppError && e.code === "FORBIDDEN") redirect("/forbidden");
    throw e;
  });
  if (!sheet) notFound();
  return (
    <>
      <BreadcrumbLabel segment={paperId} label={`${sheet.paper.subject} · ${sheet.paper.className}-${sheet.paper.sectionName}`} />
      <MarksEntry key={`${paperId}:${section}:${sheet.paper.lastUpdate}`} sheet={sheet} />
    </>
  );
}
