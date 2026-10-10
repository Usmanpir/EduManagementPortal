import { created, ok, route } from "@/server/http/api";
import { createStudent, listStudents } from "@/server/modules/people/students";
import { studentSchema } from "@/lib/validation/people";
import { studentListQuery } from "@/lib/validation/query";

export const GET = route({ permission: "students.view", query: studentListQuery }, async ({ ctx, query }) => ok(await listStudents(ctx, query)));

export const POST = route({ permission: "students.create", body: studentSchema }, async ({ ctx, body }) => {
  const student = await createStudent(ctx, body);
  return created({ id: student.id, admissionNo: student.admissionNo }, `${student.firstName} ${student.lastName} was added.`);
});
