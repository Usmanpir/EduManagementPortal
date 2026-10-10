import { created, ok, route } from "@/server/http/api";
import { createRole, listRoles } from "@/server/modules/users/service";
import { roleSchema } from "@/lib/validation/organization";

export const GET = route({ permission: "roles.view" }, async ({ ctx }) => ok(await listRoles(ctx)));

export const POST = route({ permission: "roles.manage", body: roleSchema }, async ({ ctx, body }) =>
  created(await createRole(ctx, body), "Role created."),
);
