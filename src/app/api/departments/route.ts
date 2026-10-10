import { created, ok, route } from "@/server/http/api";
import { listDepartments, saveDepartment } from "@/server/modules/academics/service";
import { departmentSchema } from "@/lib/validation/academics";

export const GET = route({ permission: "academics.view" }, async ({ ctx }) => ok(await listDepartments(ctx)));

export const POST = route({ permission: "academics.manage", body: departmentSchema }, async ({ ctx, body }) =>
  created(await saveDepartment(ctx, null, body), "Department created."),
);
