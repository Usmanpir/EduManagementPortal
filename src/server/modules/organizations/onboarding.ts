import "server-only";
import { auditFor } from "@/server/audit";
import type { TenantContext } from "@/server/auth/context";
import { db } from "@/server/db/client";
import { updateOrganizationSettings } from "./service";

export type SetupStep = { key: string; title: string; description: string; href: string; action: string; done: boolean; optional: boolean; detail?: string };

/**
 * Setup checklist, worked out from the school's real data — a step is done
 * when the thing exists, not when someone ticks a box.
 */
export async function setupChecklist(ctx: TenantContext) {
  const [org, campuses, classes, sections, teachers, students, otherUsers, invites, registers, fees, periods] = await Promise.all([
    db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { phone: true, address: true, onboardingCompletedAt: true } }),
    ctx.db.campus.count({ where: { deletedAt: null } }),
    ctx.db.class.count({ where: { deletedAt: null } }),
    ctx.db.section.count({ where: { deletedAt: null } }),
    ctx.db.teacher.count({ where: { staff: { deletedAt: null } } }),
    ctx.db.student.count({ where: { archivedAt: null } }),
    ctx.db.user.count({ where: { id: { not: ctx.user.id }, deletedAt: null } }),
    ctx.db.invitation.count({ where: { acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    ctx.db.attendanceSession.count(),
    ctx.db.feeStructure.count(),
    ctx.db.period.count(),
  ]);
  const steps: SetupStep[] = [
    { key: "profile", title: "School details", description: "Address and phone appear on invoices, receipts and report cards.", href: "/settings/general", action: "Add details", done: !!(org.phone && org.address), optional: false },
    { key: "classes", title: "Classes & sections", description: "Create your classes (e.g. Grade 1–10) and their sections.", href: "/academics/classes?new=1", action: "Add classes", done: classes > 0 && sections > 0, optional: false, detail: classes ? `${classes} classes · ${sections} sections${campuses > 1 ? ` · ${campuses} campuses` : ""}` : undefined },
    { key: "teachers", title: "Teachers", description: "Add teachers, then assign class teachers and subjects on each section.", href: "/teachers", action: "Add teachers", done: teachers > 0, optional: false, detail: teachers ? `${teachers} teachers` : undefined },
    { key: "students", title: "Students", description: "Add students one by one or import your list from Excel or CSV.", href: "/students/import", action: "Import students", done: students > 0, optional: false, detail: students ? `${students.toLocaleString()} students` : undefined },
    { key: "users", title: "Invite your team", description: "Give teachers and office staff their own sign-in.", href: "/settings/users", action: "Invite people", done: otherUsers > 0 || invites > 0, optional: false, detail: otherUsers || invites ? `${otherUsers} users${invites ? ` · ${invites} pending invites` : ""}` : undefined },
    { key: "attendance", title: "Take the first register", description: "Mark one section's attendance to see how it works for teachers.", href: "/attendance", action: "Open attendance", done: registers > 0, optional: false },
    { key: "timetable", title: "Bell schedule & timetable", description: "Needed for period-wise attendance and teachers' daily schedule.", href: "/academics/timetable", action: "Set up timetable", done: periods > 0, optional: true },
    { key: "fees", title: "Fees", description: "Set your fee structure to generate monthly invoices.", href: "/finance/fees", action: "Set up fees", done: fees > 0, optional: true },
  ];
  const required = steps.filter((s) => !s.optional);
  return { steps, done: required.filter((s) => s.done).length, total: required.length, completedAt: org.onboardingCompletedAt?.toISOString() ?? null };
}

export async function completeSetup(ctx: TenantContext) {
  await db.organization.update({ where: { id: ctx.orgId }, data: { onboardingCompletedAt: new Date() } });
  await auditFor(ctx)({ action: "onboarding.complete", entityType: "organization", entityId: ctx.orgId });
}

/** Hides the "finish setup" banner without marking setup complete. */
export async function dismissSetup(ctx: TenantContext) {
  await updateOrganizationSettings(ctx, { onboarding: { dismissed: true } }, "onboarding.dismiss");
}
