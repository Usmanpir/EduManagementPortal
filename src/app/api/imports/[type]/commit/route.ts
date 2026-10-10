import { z } from "zod";
import { ok, param, route } from "@/server/http/api";
import { importer } from "@/server/modules/imports/registry";
import { MAX_IMPORT_ROWS, sanitizeFileName } from "@/server/modules/imports/parse";

const body = z.object({
  fileName: z.string().max(200).transform(sanitizeFileName),
  rows: z
    .array(z.object({ rowNumber: z.number().int().min(1), values: z.record(z.string().max(100), z.string().max(500)) }))
    .min(1)
    .max(MAX_IMPORT_ROWS),
});

/** Step 2: import the (possibly corrected) rows. Everything is validated again server-side. */
export const POST = route({ anyPermission: ["students.import", "staff.manage", "teachers.manage"], body }, async ({ ctx, params, body }) => {
  const imp = importer(param(params, "type"), ctx);
  const result = await imp.commit(ctx, body.fileName, body.rows);
  return ok(result, `${result.imported} ${imp.label} imported${result.failed ? `, ${result.failed} failed` : ""}.`);
});
