import { created, route } from "@/server/http/api";
import { requireSuperAdminApi } from "@/server/auth/platform";
import { savePlan } from "@/server/modules/platform/billing";
import { planSchema } from "@/lib/validation/billing";

export const POST = route({ auth: false, platform: true, body: planSchema }, async ({ body }) => {
  const session = await requireSuperAdminApi();
  const plan = await savePlan(session.user.id, null, body);
  return created({ id: plan.id }, `${plan.name} plan created.`);
});
