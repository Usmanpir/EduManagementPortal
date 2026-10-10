import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PrintHeader } from "@/components/print/print-header";
import { EXAM_TYPE_LABELS } from "@/components/exams/exam-ui";
import { requirePageContext } from "@/server/auth/context";
import { AppError } from "@/server/http/errors";
import { getExam } from "@/server/modules/exams/service";
import { formatDate } from "@/lib/format";

export const metadata: Metadata = { title: "Date sheet" };

export default async function PrintDateSheet({ searchParams }: PageProps<"/exams/print/date-sheet">) {
  const ctx = await requirePageContext("exams.view");
  const { exam: examId } = await searchParams;
  if (typeof examId !== "string" || !/^[0-9a-f-]{36}$/i.test(examId)) notFound();
  const exam = await getExam(ctx, examId).catch((e) => {
    if (e instanceof AppError && e.code === "NOT_FOUND") return null;
    throw e;
  });
  if (!exam) notFound();
  const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, address: true, phone: true, email: true } });

  return (
    <article className="text-small">
      <PrintHeader organization={org} title="Date sheet" subtitle={exam.name} meta={<p className="text-caption text-muted-foreground">{EXAM_TYPE_LABELS[exam.type]} · {formatDate(exam.startDate, "long")} – {formatDate(exam.endDate, "long")}</p>} />
      {exam.description && <p className="mb-4 text-muted-foreground">{exam.description}</p>}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2">
        {exam.classes.map((c) => (
          <section key={c.id} className="break-inside-avoid">
            <h2 className="mb-1.5 text-h3">{c.name}</h2>
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b text-caption text-muted-foreground">
                  <th className="py-1 text-start font-medium">Date</th>
                  <th className="py-1 text-start font-medium">Subject</th>
                  <th className="py-1 text-end font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {[...c.papers]
                  .sort((a, b) => (a.date ?? "9").localeCompare(b.date ?? "9") || (a.start ?? "").localeCompare(b.start ?? ""))
                  .map((p) => (
                    <tr key={p.id} className="border-b">
                      <td className="py-1 whitespace-nowrap">{p.date ? formatDate(p.date, "weekday") : "To be announced"}</td>
                      <td className="py-1 font-medium">
                        {p.subject}
                        {p.room && <span className="font-normal text-muted-foreground"> · {p.room}</span>}
                      </td>
                      <td className="py-1 text-end whitespace-nowrap tabular">{p.start ? `${p.start}${p.end ? `–${p.end}` : ""}` : "—"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </section>
        ))}
      </div>
    </article>
  );
}
