import { created, route, uuidParam } from "@/server/http/api";
import { addGuardianToStudent } from "@/server/modules/people/students";
import { guardianInputSchema } from "@/lib/validation/people";

export const POST = route({ permission: "students.update", body: guardianInputSchema }, async ({ ctx, body, params }) =>
  created({ id: await addGuardianToStudent(ctx, uuidParam(params, "id"), body) }, "Guardian added."),
);
