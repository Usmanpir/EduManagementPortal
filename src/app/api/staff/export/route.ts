import { z } from "zod";
import { auditFor } from "@/server/audit";
import { assertCan } from "@/server/auth/context";
import { tabularResponse } from "@/server/export/tabular";
import { route } from "@/server/http/api";
import { exportStaff } from "@/server/modules/people/staff";
import { staffListQuery } from "@/lib/validation/query";

const query = staffListQuery.omit({ page: true, pageSize: true }).extend({ format: z.enum(["csv", "xlsx"]).default("csv") });

export const GET = route({ query }, async ({ ctx, query }) => {
  assertCan(ctx, query.kind === "teacher" ? "teachers.view" : "staff.view", "reports.export");
  const { format, ...filters } = query;
  const rows = await exportStaff(ctx, filters);
  await auditFor(ctx)({ action: "staff.export", entityType: "staff", metadata: { format, count: rows.length } });
  return tabularResponse(rows, { name: query.kind === "teacher" ? "teachers" : "staff", format });
});
