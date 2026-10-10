import "server-only";
import type { TenantContext } from "@/server/auth/context";
import { accessibleSectionIds } from "@/server/modules/academics/scope";
import type { PeopleLookups } from "@/components/people/types";

/** Campuses, sections and settings needed by student/staff forms and filters. */
export async function peopleLookups(ctx: TenantContext): Promise<PeopleLookups> {
  const allowed = await accessibleSectionIds(ctx);
  const campusFilter = ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {};
  const [campuses, sections, departments] = await Promise.all([
    ctx.db.campus.findMany({ where: { deletedAt: null, ...campusFilter }, select: { id: true, name: true }, orderBy: [{ isMain: "desc" }, { name: "asc" }] }),
    ctx.db.section.findMany({
      where: {
        deletedAt: null,
        class: { deletedAt: null },
        ...(allowed ? { id: { in: allowed } } : {}),
        ...(ctx.campusId ? { campusId: ctx.campusId } : ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}),
      },
      select: { id: true, name: true, classId: true, campusId: true, class: { select: { name: true, level: true } }, campus: { select: { name: true } } },
      orderBy: [{ class: { level: "asc" } }, { class: { name: "asc" } }, { name: "asc" }],
    }),
    ctx.db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  // When several campuses are in view, "Grade 2 — B" is ambiguous; add the campus.
  const multiCampus = new Set(sections.map((s) => s.campusId)).size > 1;
  return {
    campuses,
    sections: sections.map((s) => ({
      id: s.id,
      name: s.name,
      classId: s.classId,
      className: multiCampus ? `${s.class.name} (${s.campus.name})` : s.class.name,
      campusId: s.campusId,
      label: `${s.class.name} — ${s.name}${multiCampus ? ` · ${s.campus.name}` : ""}`,
    })),
    departments,
    identity: ctx.settings.identity,
  };
}
