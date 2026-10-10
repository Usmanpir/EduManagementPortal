import { ok, route, uuidParam } from "@/server/http/api";
import { requireSuperAdminApi } from "@/server/auth/platform";
import { updateSubscription } from "@/server/modules/platform/billing";
import { subscriptionUpdateSchema } from "@/lib/validation/billing";

export const PUT = route({ auth: false, platform: true, body: subscriptionUpdateSchema }, async ({ params, body }) => {
  const session = await requireSuperAdminApi();
  await updateSubscription(session.user.id, uuidParam(params, "id"), body);
  return ok(null, "Subscription updated.");
});
