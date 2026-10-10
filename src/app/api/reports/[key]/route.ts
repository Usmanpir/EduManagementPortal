import { z } from "zod";
import { auditFor } from "@/server/audit";
import { assertCan } from "@/server/auth/context";
import { tabularResponse } from "@/server/export/tabular";
import { ok, param, route } from "@/server/http/api";
import { runReport } from "@/server/modules/reports/registry";
import { reportParamsSchema, type ReportResult } from "@/lib/reports";

const query = reportParamsSchema.extend({ format: z.enum(["json", "csv", "xlsx"]).default("json") });

/** Flattens a result to spreadsheet rows keyed by column label. */
function toSheet(result: ReportResult) {
  return result.rows.map((row) =>
    Object.fromEntries(
      result.columns.map((c) => {
        const v = row[c.key];
        return [c.label, c.format === "percent" && typeof v === "number" ? Math.round(v * 10) / 10 : v];
      }),
    ),
  );
}

export const GET = route({ permission: "reports.view", query }, async ({ ctx, params, query }) => {
  const { format, ...raw } = query;
  const { meta, params: used, result } = await runReport(ctx, param(params, "key"), raw);
  if (format === "json") return ok({ params: used, ...result });
  assertCan(ctx, "reports.export");
  await auditFor(ctx)({ action: "report.export", entityType: "report", metadata: { report: meta.key, format, ...used, rows: result.rows.length } });
  return tabularResponse(toSheet(result), { name: meta.key, format, headers: result.columns.map((c) => c.label) });
});
