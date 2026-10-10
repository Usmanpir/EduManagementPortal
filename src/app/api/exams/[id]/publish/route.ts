import { ok, route, uuidParam } from "@/server/http/api";
import { publishResults } from "@/server/modules/exams/results";
import { publishSchema } from "@/lib/validation/exams";

export const POST = route({ permission: "results.publish", body: publishSchema }, async ({ ctx, params, body }) => {
  const r = await publishResults(ctx, uuidParam(params, "id"), body.publish, body.notify);
  return ok(r, body.publish ? `Results published.${r.notified ? ` ${r.notified} families notified.` : ""}` : "Results unpublished. Families can no longer see them.");
});
