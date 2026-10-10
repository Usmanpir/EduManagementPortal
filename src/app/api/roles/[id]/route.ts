import { ok, route, uuidParam } from "@/server/http/api";
import { deleteRole, updateRole } from "@/server/modules/users/service";
import { roleSchema } from "@/lib/validation/organization";

export const PATCH = route({ permission: "roles.manage", body: roleSchema }, async ({ ctx, body, params }) => {
  await updateRole(ctx, uuidParam(params, "id"), body);
  return ok(null, "Role updated.");
});

export const DELETE = route({ permission: "roles.manage" }, async ({ ctx, params }) => {
  await deleteRole(ctx, uuidParam(params, "id"));
  return ok(null, "Role deleted.");
});
