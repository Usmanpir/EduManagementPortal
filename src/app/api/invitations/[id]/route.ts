import { z } from "zod";
import { ok, route, uuidParam } from "@/server/http/api";
import { resendInvitation, revokeInvitation } from "@/server/modules/users/service";

export const POST = route({ permission: "users.manage", body: z.object({ action: z.literal("resend") }) }, async ({ ctx, params }) => {
  await resendInvitation(ctx, uuidParam(params, "id"));
  return ok(null, "Invitation resent.");
});

export const DELETE = route({ permission: "users.manage" }, async ({ ctx, params }) => {
  await revokeInvitation(ctx, uuidParam(params, "id"));
  return ok(null, "Invitation revoked.");
});
