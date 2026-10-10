import { created, ok, route } from "@/server/http/api";
import { createCampus, listCampuses } from "@/server/modules/organizations/service";
import { campusSchema } from "@/lib/validation/organization";

export const GET = route({ permission: "campuses.view" }, async ({ ctx }) => ok(await listCampuses(ctx)));

export const POST = route({ permission: "campuses.manage", body: campusSchema }, async ({ ctx, body }) =>
  created(await createCampus(ctx, body), "Campus created."),
);
