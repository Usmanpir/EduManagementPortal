import { ok, route, uuidParam } from "@/server/http/api";
import { setExamStatus } from "@/server/modules/exams/service";
import { examStatusSchema } from "@/lib/validation/exams";

export const POST = route({ permission: "exams.manage", body: examStatusSchema }, async ({ ctx, params, body }) => {
  await setExamStatus(ctx, uuidParam(params, "id"), body.status);
  return ok(null, body.status === "SCHEDULED" ? "Date sheet published. Teachers and families can now see it." : "Exam moved back to draft.");
});
