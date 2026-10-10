import { z } from "zod";
import { auditFor } from "@/server/audit";
import { assertCan } from "@/server/auth/context";
import { tabularResponse } from "@/server/export/tabular";
import { ok, route } from "@/server/http/api";
import { badRequest } from "@/server/http/errors";
import { attendanceReport, attendanceReportRows } from "@/server/modules/attendance/report";
import { isoDate, optionalUuid } from "@/lib/validation/common";
import { daysBetween } from "@/server/modules/attendance/register";

const query = z.object({
  from: isoDate,
  to: isoDate,
  classId: optionalUuid,
  sectionId: optionalUuid,
  format: z.enum(["json", "csv", "xlsx"]).default("json"),
});

export const GET = route({ permission: "attendance.view", query }, async ({ ctx, query }) => {
  if (query.to < query.from) throw badRequest("The end date must be after the start date.");
  if (daysBetween(query.from, query.to) > 400) throw badRequest("Choose a range of at most 400 days.");
  const { format, ...params } = query;
  if (format === "json") return ok(await attendanceReport(ctx, params));
  assertCan(ctx, "reports.export");
  const rows = await attendanceReportRows(ctx, params);
  await auditFor(ctx)({ action: "report.export", entityType: "report", metadata: { report: "attendance", format, ...params } });
  return tabularResponse(rows, { name: `attendance-${params.from}-to-${params.to}`, format });
});
