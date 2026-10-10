import { ok, route, uuidParam } from "@/server/http/api";
import { saveSchedule } from "@/server/modules/exams/service";
import { scheduleSchema } from "@/lib/validation/exams";

export const PUT = route({ permission: "exams.manage", body: scheduleSchema }, async ({ ctx, params, body }) => {
  await saveSchedule(ctx, uuidParam(params, "id"), body);
  return ok(null, "Date sheet saved.");
});
