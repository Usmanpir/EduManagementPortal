import { created, ok, route } from "@/server/http/api";
import { listAcademicYears, saveAcademicYear } from "@/server/modules/academics/service";
import { academicYearSchema } from "@/lib/validation/academics";

export const GET = route({ permission: "academics.view" }, async ({ ctx }) => ok(await listAcademicYears(ctx)));

export const POST = route({ permission: "academics.manage", body: academicYearSchema }, async ({ ctx, body }) =>
  created(await saveAcademicYear(ctx, null, body), "Academic year created."),
);
