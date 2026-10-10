import "server-only";
import { cache } from "react";
import { db } from "@/server/db/client";
import { can, type TenantContext } from "@/server/auth/context";
import { forbidden } from "@/server/http/errors";

/**
 * Sections whose students a teacher-level user may see: sections they teach a
 * subject in, are class teacher of, or have timetable periods with.
 */
export const teacherSectionIds = cache(async (orgId: string, staffId: string | null, teacherId: string | null) => {
  if (!staffId) return [] as string[];
  const [assignments, classTeacher, timetable] = await Promise.all([
    teacherId
      ? db.teacherSubject.findMany({ where: { organizationId: orgId, teacherId }, select: { sectionId: true } })
      : Promise.resolve([]),
    db.section.findMany({ where: { organizationId: orgId, classTeacherId: staffId, deletedAt: null }, select: { id: true } }),
    teacherId
      ? db.timetableEntry.findMany({ where: { organizationId: orgId, teacherId }, select: { sectionId: true }, distinct: ["sectionId"] })
      : Promise.resolve([]),
  ]);
  return [...new Set([...assignments.map((a) => a.sectionId), ...classTeacher.map((s) => s.id), ...timetable.map((t) => t.sectionId)])];
});

/** null = unrestricted; otherwise the only section ids this user may access. */
export async function accessibleSectionIds(ctx: TenantContext): Promise<string[] | null> {
  if (can(ctx, "records.all")) return null;
  return teacherSectionIds(ctx.orgId, ctx.staffId, ctx.teacherId);
}

/** Prisma `where` fragment for student-like rows with a `sectionId` column. */
export async function sectionScope(ctx: TenantContext): Promise<{ sectionId?: { in: string[] } }> {
  const ids = await accessibleSectionIds(ctx);
  return ids === null ? {} : { sectionId: { in: ids } };
}

export async function assertSectionAccess(ctx: TenantContext, sectionId: string) {
  const ids = await accessibleSectionIds(ctx);
  if (ids !== null && !ids.includes(sectionId)) throw forbidden("You aren't assigned to this class.");
}
