import { ok, route, uuidParam } from "@/server/http/api";
import { deleteExam, getExam, updateExam } from "@/server/modules/exams/service";
import { examSchema } from "@/lib/validation/exams";

export const GET = route({ permission: "exams.view" }, async ({ ctx, params }) => ok(await getExam(ctx, uuidParam(params, "id"))));

export const PATCH = route({ permission: "exams.manage", body: examSchema }, async ({ ctx, params, body }) => {
  await updateExam(ctx, uuidParam(params, "id"), body);
  return ok(null, "Exam updated.");
});

export const DELETE = route({ permission: "exams.manage" }, async ({ ctx, params }) => {
  await deleteExam(ctx, uuidParam(params, "id"));
  return ok(null, "Exam deleted.");
});
