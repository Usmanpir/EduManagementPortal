import { z } from "zod";
import { ok, route, uuidParam } from "@/server/http/api";
import { badRequest, notFound } from "@/server/http/errors";
import { findAccessibleStudent, removeGuardianFromStudent, updateGuardian } from "@/server/modules/people/students";
import { inviteUser } from "@/server/modules/users/service";
import { guardianInputSchema } from "@/lib/validation/people";

export const PATCH = route({ permission: "students.update", body: guardianInputSchema }, async ({ ctx, body, params }) => {
  await updateGuardian(ctx, uuidParam(params, "id"), uuidParam(params, "guardianId"), body);
  return ok(null, "Guardian updated.");
});

export const DELETE = route({ permission: "students.update" }, async ({ ctx, params }) => {
  await removeGuardianFromStudent(ctx, uuidParam(params, "id"), uuidParam(params, "guardianId"));
  return ok(null, "Guardian removed from this student.");
});

/** Gives a guardian access to the parent portal by emailing them an invitation. */
export const POST = route({ permission: "students.update", body: z.object({ action: z.literal("invite") }) }, async ({ ctx, params }) => {
  const studentId = uuidParam(params, "id");
  const guardianId = uuidParam(params, "guardianId");
  const student = await findAccessibleStudent(ctx, studentId);
  if (!student) throw notFound("Student");
  const link = await ctx.db.studentGuardian.findFirst({ where: { studentId, guardianId }, include: { guardian: true } });
  if (!link) throw notFound("Guardian");
  if (link.guardian.userId) throw badRequest("This guardian already has portal access.");
  if (!link.guardian.email) throw badRequest("Add an email address for this guardian first.");
  const role = await ctx.db.role.findFirst({ where: { key: "parent" }, select: { id: true } });
  if (!role) throw notFound("Parent role");
  await inviteUser(ctx, { email: link.guardian.email, roleId: role.id, campusId: null });
  return ok(null, `Portal invitation sent to ${link.guardian.email}.`);
});
