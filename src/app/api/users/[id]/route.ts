import { ok, route, uuidParam } from "@/server/http/api";
import { updateUser } from "@/server/modules/users/service";
import { updateUserSchema } from "@/lib/validation/organization";

export const PATCH = route({ permission: "users.manage", body: updateUserSchema }, async ({ ctx, body, params }) => {
  await updateUser(ctx, uuidParam(params, "id"), body);
  return ok(null, "User updated.");
});
