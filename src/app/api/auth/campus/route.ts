import { z } from "zod";
import { db } from "@/server/db/client";
import { ok, route } from "@/server/http/api";
import { assertCampusAccess } from "@/server/auth/context";
import { notFound } from "@/server/http/errors";

const body = z.object({ campusId: z.uuid().nullable() });

/** Switches the campus the current session works in (null = organization-wide). */
export const PUT = route({ body, allowInactiveSubscription: true }, async ({ ctx, body }) => {
  if (body.campusId) {
    const campus = await ctx.db.campus.findFirst({ where: { id: body.campusId, deletedAt: null }, select: { id: true } });
    if (!campus) throw notFound("Campus");
    assertCampusAccess(ctx, campus.id);
  } else if (ctx.allowedCampusIds) {
    // Users limited to specific campuses can't switch to the organization-wide view.
    assertCampusAccess(ctx, "__all__");
  }
  await db.session.update({ where: { id: ctx.sessionId }, data: { campusId: body.campusId } });
  return ok({ campusId: body.campusId }, "Campus switched.");
});
