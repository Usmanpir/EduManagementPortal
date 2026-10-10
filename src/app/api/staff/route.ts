import { assertCan, canAny } from "@/server/auth/context";
import { created, ok, route } from "@/server/http/api";
import { forbidden } from "@/server/http/errors";
import { createStaff, listStaff } from "@/server/modules/people/staff";
import { staffSchema } from "@/lib/validation/people";
import { staffListQuery } from "@/lib/validation/query";

export const GET = route({ query: staffListQuery }, async ({ ctx, query }) => {
  // Teachers list needs teachers.view; the full staff list needs staff.view.
  if (query.kind === "teacher") assertCan(ctx, "teachers.view");
  else if (!canAny(ctx, "staff.view")) throw forbidden();
  return ok(await listStaff(ctx, query));
});

export const POST = route({ anyPermission: ["staff.manage", "teachers.manage"], body: staffSchema }, async ({ ctx, body }) => {
  assertCan(ctx, body.isTeacher ? "teachers.manage" : "staff.manage");
  const staff = await createStaff(ctx, body);
  return created({ id: staff.id, employeeCode: staff.employeeCode }, `${staff.firstName} ${staff.lastName} was added${body.inviteToSignIn ? " and invited to sign in" : ""}.`);
});
