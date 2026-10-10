import { ok, route, uuidParam } from "@/server/http/api";
import { requireSuperAdminApi } from "@/server/auth/platform";
import { setOrganizationStatus } from "@/server/modules/platform/billing";
import { orgStatusSchema } from "@/lib/validation/billing";

export const POST = route({ auth: false, platform: true, body: orgStatusSchema }, async ({ params, body }) => {
  const session = await requireSuperAdminApi();
  await setOrganizationStatus(session.user.id, uuidParam(params, "id"), body);
  return ok(null, body.status === "SUSPENDED" ? "Organization suspended. It is now read-only." : "Organization reactivated.");
});
