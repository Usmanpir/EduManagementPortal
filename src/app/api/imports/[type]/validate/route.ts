import { z } from "zod";
import { ok, param, route } from "@/server/http/api";
import { importer } from "@/server/modules/imports/registry";
import { MAX_IMPORT_ROWS } from "@/server/modules/imports/parse";

const body = z.object({
  rows: z
    .array(z.object({ rowNumber: z.number().int().min(1), values: z.record(z.string().max(100), z.string().max(500)) }))
    .min(1)
    .max(MAX_IMPORT_ROWS),
});

/** Re-checks rows the user corrected in the review step. Saves nothing. */
export const POST = route({ anyPermission: ["students.import", "staff.manage", "teachers.manage"], body }, async ({ ctx, params, body }) => {
  const imp = importer(param(params, "type"), ctx);
  const checked = await imp.preview(ctx, body.rows.map((r) => r.values));
  const rows = checked.map((r, i) => ({ ...r, rowNumber: body.rows[i]!.rowNumber }));
  const invalid = rows.filter((r) => r.errors.length > 0).length;
  return ok({ rows, summary: { total: rows.length, valid: rows.length - invalid, invalid } });
});
