import { clientIp, ok, param, route } from "@/server/http/api";
import { badRequest } from "@/server/http/errors";
import { importer } from "@/server/modules/imports/registry";
import { parseUpload } from "@/server/modules/imports/parse";
import { RATE_LIMITS } from "@/server/security/rate-limit";

/** Step 1: upload a file → every row validated, nothing saved yet. */
export const POST = route(
  { rateLimit: { key: (req) => `upload:${clientIp(req)}`, rule: RATE_LIMITS.upload } },
  async ({ ctx, params, req }) => {
    const imp = importer(param(params, "type"), ctx);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) throw badRequest("Choose a file to upload.");
    const sheet = await parseUpload(file);
    const rows = await imp.preview(ctx, sheet.rows);
    const invalid = rows.filter((r) => r.errors.length > 0).length;
    return ok({ fileName: sheet.fileName, headers: sheet.headers, rows, summary: { total: rows.length, valid: rows.length - invalid, invalid } });
  },
);
