import { z } from "zod";
import { auditFor } from "@/server/audit";
import { assertCan } from "@/server/auth/context";
import { tabularResponse } from "@/server/export/tabular";
import { ok, route } from "@/server/http/api";
import { badRequest } from "@/server/http/errors";
import { daysBetween } from "@/server/modules/attendance/register";
import { financeReport, financeReportRows } from "@/server/modules/finance/report";
import { isoDate, optionalUuid } from "@/lib/validation/common";

const query = z.object({
  from: isoDate,
  to: isoDate,
  classId: optionalUuid,
  kind: z.enum(["outstanding", "classes"]).default("outstanding"),
  format: z.enum(["json", "csv", "xlsx"]).default("json"),
});

export const GET = route({ permission: "invoices.view", query }, async ({ ctx, query }) => {
  if (query.to < query.from) throw badRequest("The end date must be after the start date.");
  if (daysBetween(query.from, query.to) > 800) throw badRequest("Choose a range of at most two years.");
  const { format, kind, ...params } = query;
  if (format === "json") return ok(await financeReport(ctx, params));
  assertCan(ctx, "reports.export");
  const rows = await financeReportRows(ctx, params, kind);
  await auditFor(ctx)({ action: "report.export", entityType: "report", metadata: { report: `finance-${kind}`, format, ...params } });
  return tabularResponse(rows, { name: `${kind === "classes" ? "collections-by-class" : "outstanding-fees"}-${params.to}`, format });
});
