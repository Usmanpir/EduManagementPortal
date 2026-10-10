import { assertCan } from "@/server/auth/context";
import { ok, route } from "@/server/http/api";
import { bulkStudentAction } from "@/server/modules/people/students";
import { bulkStudentActionSchema } from "@/lib/validation/people";

export const POST = route({ anyPermission: ["students.update", "students.archive"], body: bulkStudentActionSchema }, async ({ ctx, body }) => {
  assertCan(ctx, body.action === "move" ? "students.update" : "students.archive");
  const count = await bulkStudentAction(ctx, body);
  const verb = body.action === "archive" ? "archived" : body.action === "restore" ? "restored" : "moved";
  return ok({ count }, `${count} ${count === 1 ? "student" : "students"} ${verb}.`);
});
