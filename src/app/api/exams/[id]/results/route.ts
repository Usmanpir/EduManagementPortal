import { z } from "zod";
import { auditFor } from "@/server/audit";
import { assertCan } from "@/server/auth/context";
import { tabularResponse } from "@/server/export/tabular";
import { ok, route, uuidParam } from "@/server/http/api";
import { computeResults, sectionResults } from "@/server/modules/exams/results";
import { uuid } from "@/lib/validation/common";

const query = z.object({ sectionId: uuid, format: z.enum(["json", "csv", "xlsx"]).default("json") });

export const GET = route({ permission: "results.view", query }, async ({ ctx, params, query }) => {
  const sheet = await sectionResults(ctx, uuidParam(params, "id"), query.sectionId);
  if (query.format === "json") return ok(sheet);
  assertCan(ctx, "reports.export");
  const rows = sheet.rows.map((r) => ({
    Roll: r.rollNumber ?? "",
    Student: r.name,
    "Admission no.": r.admissionNo,
    ...Object.fromEntries(sheet.papers.map((p, i) => [`${p.subject} (${p.maxMarks})`, r.marks[i] ?? ""])),
    Total: r.result?.total ?? "",
    "Out of": r.result?.max ?? "",
    "%": r.result?.percentage ?? "",
    Grade: r.result?.grade ?? "",
    Position: r.result?.position ?? "",
    Result: r.result?.status ?? "",
  }));
  await auditFor(ctx)({ action: "report.export", entityType: "report", metadata: { report: "results", examId: sheet.exam.id, sectionId: query.sectionId, format: query.format } });
  return tabularResponse(rows, { name: `results-${sheet.exam.name}-${sheet.section.label}`.replace(/[^\w-]+/g, "-"), format: query.format });
});

/** Recompute results from the marks entered so far. */
export const POST = route({ permission: "results.publish" }, async ({ ctx, params }) => {
  const s = await computeResults(ctx, uuidParam(params, "id"));
  return ok(s, `Results computed: ${s.pass} passed, ${s.fail} failed${s.incomplete ? `, ${s.incomplete} incomplete` : ""}.`);
});
