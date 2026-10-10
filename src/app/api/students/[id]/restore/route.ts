import { ok, route, uuidParam } from "@/server/http/api";
import { restoreStudent } from "@/server/modules/people/students";

export const POST = route({ permission: "students.archive" }, async ({ ctx, params }) => {
  await restoreStudent(ctx, uuidParam(params, "id"));
  return ok(null, "Student restored to active.");
});
