import { ok, route, uuidParam } from "@/server/http/api";
import { archiveSubject, saveSubject } from "@/server/modules/academics/service";
import { subjectSchema } from "@/lib/validation/academics";

export const PATCH = route({ permission: "academics.manage", body: subjectSchema }, async ({ ctx, body, params }) =>
  ok(await saveSubject(ctx, uuidParam(params, "id"), body), "Subject updated."),
);

export const DELETE = route({ permission: "academics.manage" }, async ({ ctx, params }) => {
  await archiveSubject(ctx, uuidParam(params, "id"));
  return ok(null, "Subject archived.");
});
