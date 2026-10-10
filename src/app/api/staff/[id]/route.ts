import { assertCan, canAny } from "@/server/auth/context";
import { ok, route, uuidParam } from "@/server/http/api";
import { forbidden, notFound } from "@/server/http/errors";
import { archiveStaff, getStaffProfile, updateStaff } from "@/server/modules/people/staff";
import { staffSchema } from "@/lib/validation/people";

export const GET = route({}, async ({ ctx, params }) => {
  if (!canAny(ctx, "staff.view", "teachers.view")) throw forbidden();
  const profile = await getStaffProfile(ctx, uuidParam(params, "id"));
  if (!profile || (!profile.staff.teacher && !canAny(ctx, "staff.view"))) throw notFound("Staff member");
  return ok(profile);
});

export const PATCH = route({ anyPermission: ["staff.manage", "teachers.manage"], body: staffSchema }, async ({ ctx, body, params }) => {
  const id = uuidParam(params, "id");
  const existing = await ctx.db.staff.findFirst({ where: { id, deletedAt: null }, select: { teacher: { select: { id: true } } } });
  if (!existing) throw notFound("Staff member");
  // Changing someone into/out of a teacher needs both permissions.
  assertCan(ctx, existing.teacher || body.isTeacher ? "teachers.manage" : "staff.manage");
  if (!!existing.teacher !== body.isTeacher) assertCan(ctx, "staff.manage", "teachers.manage");
  await updateStaff(ctx, id, body);
  return ok(null, "Changes saved.");
});

export const DELETE = route({}, async ({ ctx, params }) => {
  const id = uuidParam(params, "id");
  const existing = await ctx.db.staff.findFirst({ where: { id, deletedAt: null }, select: { teacher: { select: { id: true } } } });
  if (!existing) throw notFound("Staff member");
  assertCan(ctx, existing.teacher ? "teachers.manage" : "staff.manage");
  await archiveStaff(ctx, id);
  return ok(null, "Moved to former staff. Their history is kept.");
});
