import { z } from "zod";
import { ok, route, uuidParam } from "@/server/http/api";
import { archiveCampus, setMainCampus, updateCampus } from "@/server/modules/organizations/service";
import { campusSchema } from "@/lib/validation/organization";

export const PATCH = route({ permission: "campuses.manage", body: campusSchema }, async ({ ctx, body, params }) =>
  ok(await updateCampus(ctx, uuidParam(params, "id"), body), "Campus updated."),
);

export const DELETE = route({ permission: "campuses.manage" }, async ({ ctx, params }) => {
  await archiveCampus(ctx, uuidParam(params, "id"));
  return ok(null, "Campus archived.");
});

export const POST = route({ permission: "campuses.manage", body: z.object({ action: z.literal("set-main") }) }, async ({ ctx, params }) => {
  await setMainCampus(ctx, uuidParam(params, "id"));
  return ok(null, "Main campus updated.");
});
