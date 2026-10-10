import { ok, route, uuidParam } from "@/server/http/api";
import { archiveDepartment, saveDepartment } from "@/server/modules/academics/service";
import { departmentSchema } from "@/lib/validation/academics";

export const PATCH = route({ permission: "academics.manage", body: departmentSchema }, async ({ ctx, body, params }) =>
  ok(await saveDepartment(ctx, uuidParam(params, "id"), body), "Department updated."),
);

export const DELETE = route({ permission: "academics.manage" }, async ({ ctx, params }) => {
  await archiveDepartment(ctx, uuidParam(params, "id"));
  return ok(null, "Department archived.");
});
