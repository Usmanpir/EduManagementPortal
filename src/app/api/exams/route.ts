import { created, ok, route } from "@/server/http/api";
import { createExam, listExams } from "@/server/modules/exams/service";
import { createExamSchema } from "@/lib/validation/exams";

export const GET = route({ permission: "exams.view" }, async ({ ctx }) => ok(await listExams(ctx)));

export const POST = route({ permission: "exams.manage", body: createExamSchema }, async ({ ctx, body }) => {
  const exam = await createExam(ctx, body);
  return created({ id: exam.id }, `${exam.name} created.`);
});
