import { ok, route, uuidParam } from "@/server/http/api";
import { revokeSession } from "@/server/modules/users/service";

export const DELETE = route({ allowInactiveSubscription: true }, async ({ ctx, params }) => {
  await revokeSession(ctx, uuidParam(params, "id"));
  return ok(null, "Session signed out.");
});
