import { created, ok, route } from "@/server/http/api";
import { inviteUser, listPendingInvitations } from "@/server/modules/users/service";
import { inviteUserSchema } from "@/lib/validation/organization";

export const GET = route({ permission: "users.view" }, async ({ ctx }) => ok(await listPendingInvitations(ctx)));

export const POST = route({ permission: "users.manage", body: inviteUserSchema }, async ({ ctx, body }) =>
  created(await inviteUser(ctx, body), `Invitation sent to ${body.email}.`),
);
