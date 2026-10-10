import { ok, route, uuidParam } from "@/server/http/api";
import { notFound } from "@/server/http/errors";
import { archiveStudent, getStudentProfile, updateStudent } from "@/server/modules/people/students";
import { archiveSchema, studentSchema } from "@/lib/validation/people";

export const GET = route({ permission: "students.view" }, async ({ ctx, params }) => {
  const profile = await getStudentProfile(ctx, uuidParam(params, "id"));
  if (!profile) throw notFound("Student");
  return ok(profile);
});

export const PATCH = route({ permission: "students.update", body: studentSchema }, async ({ ctx, body, params }) => {
  await updateStudent(ctx, uuidParam(params, "id"), body);
  return ok(null, "Changes saved.");
});

export const DELETE = route({ permission: "students.archive", body: archiveSchema }, async ({ ctx, body, params }) => {
  await archiveStudent(ctx, uuidParam(params, "id"), body.reason);
  return ok(null, "Student archived. Their records are kept.");
});
