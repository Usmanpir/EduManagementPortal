import { ok, route } from "@/server/http/api";
import { getOrganizationProfile, updateOrganizationGeneral } from "@/server/modules/organizations/service";
import { organizationGeneralSchema } from "@/lib/validation/organization";

export const GET = route({}, async ({ ctx }) => ok(await getOrganizationProfile(ctx)));

export const PATCH = route({ permission: "organization.manage", body: organizationGeneralSchema }, async ({ ctx, body }) => {
  await updateOrganizationGeneral(ctx, body);
  return ok(null, "Changes saved.");
});
