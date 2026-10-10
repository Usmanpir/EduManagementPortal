import { ok, route, uuidParam } from "@/server/http/api";
import { setClassSubjects } from "@/server/modules/academics/service";
import { classSubjectsSchema } from "@/lib/validation/academics";

export const PUT = route({ permission: "academics.manage", body: classSubjectsSchema }, async ({ ctx, body, params }) => {
  await setClassSubjects(ctx, uuidParam(params, "id"), body);
  return ok(null, "Subjects updated.");
});
