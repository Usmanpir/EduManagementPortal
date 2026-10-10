import { z } from "zod";
import { auditFor } from "@/server/audit";
import { tabularResponse } from "@/server/export/tabular";
import { route } from "@/server/http/api";
import { exportStudents } from "@/server/modules/people/students";
import { csvList, studentListQuery } from "@/lib/validation/query";

const query = studentListQuery.omit({ page: true, pageSize: true }).extend({ format: z.enum(["csv", "xlsx"]).default("csv"), ids: csvList });

export const GET = route({ permission: "students.export", query }, async ({ ctx, query }) => {
  const { format, ids, ...filters } = query;
  const rows = await exportStudents(ctx, filters, ids);
  await auditFor(ctx)({ action: "student.export", entityType: "student", metadata: { format, count: rows.length, filters } });
  return tabularResponse(rows, { name: "students", format });
});
