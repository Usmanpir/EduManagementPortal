import { ok, route, uuidParam } from "@/server/http/api";
import { requireSuperAdminApi } from "@/server/auth/platform";
import { savePlan } from "@/server/modules/platform/billing";
import { planSchema } from "@/lib/validation/billing";

export const PUT = route({ auth: false, platform: true, body: planSchema }, async ({ params, body }) => {
  const session = await requireSuperAdminApi();
  const plan = await savePlan(session.user.id, uuidParam(params, "id"), body);
  return ok({ id: plan.id }, `${plan.name} plan saved. Existing subscribers follow the new limits immediately.`);
});
