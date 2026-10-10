import { ok, route, uuidParam } from "@/server/http/api";
import { deleteAcademicYear, saveAcademicYear } from "@/server/modules/academics/service";
import { academicYearSchema } from "@/lib/validation/academics";

export const PATCH = route({ permission: "academics.manage", body: academicYearSchema }, async ({ ctx, body, params }) =>
  ok(await saveAcademicYear(ctx, uuidParam(params, "id"), body), "Academic year updated."),
);

export const DELETE = route({ permission: "academics.manage" }, async ({ ctx, params }) => {
  await deleteAcademicYear(ctx, uuidParam(params, "id"));
  return ok(null, "Academic year deleted.");
});
