import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import type { DemoContext } from "./demo";
import { createRandom } from "./random";

const r = createRandom(11);
const DAYS = [1, 2, 3, 4, 5, 6];

export async function seedTimetable(ctx: DemoContext) {
  const orgId = ctx.orgId;
  if ((await db.period.count({ where: { organizationId: orgId } })) > 0) return;

  for (const campusId of Object.values(ctx.campuses)) {
    const rows: Prisma.PeriodCreateManyInput[] = [];
    let t = 8 * 60;
    let order = 1;
    for (let i = 1; i <= 8; i++) {
      if (i === 5) {
        rows.push({ organizationId: orgId, campusId, name: "Break", startMinute: t, endMinute: t + 20, sortOrder: order++, isBreak: true });
        t += 20;
      }
      rows.push({ organizationId: orgId, campusId, name: `Period ${i}`, startMinute: t, endMinute: t + 40, sortOrder: order++, isBreak: false });
      t += 40;
    }
    await db.period.createMany({ data: rows });
  }

  const periods = await db.period.findMany({ where: { organizationId: orgId, isBreak: false }, orderBy: { sortOrder: "asc" } });
  const sections = await db.section.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: { class: { include: { subjects: { include: { subject: true } } } }, teachingAssignments: true },
  });
  const labs = await db.room.findMany({ where: { organizationId: orgId, type: "LAB" } });
  const teacherBusy = new Set<string>();
  const roomBusy = new Set<string>();
  const entries: Prisma.TimetableEntryCreateManyInput[] = [];

  for (const section of sections) {
    const slots = DAYS.flatMap((d) => periods.filter((p) => p.campusId === section.campusId).map((p) => ({ d, p })));
    const taken = new Set<string>();
    const lessons = section.class.subjects.flatMap((cs) => Array.from({ length: cs.periodsPerWeek ?? 2 }, () => cs));
    // Core subjects early in the day: shuffle lightly then sort by subject so days get variety.
    lessons.sort(() => r.next() - 0.5);
    for (const cs of lessons) {
      const teacherId = section.teachingAssignments.find((a) => a.subjectId === cs.subjectId)?.teacherId ?? null;
      const lab = ["PHY", "CHEM", "CS"].includes(cs.subject.code) ? labs.find((l) => l.campusId === section.campusId && l.name.startsWith(cs.subject.code === "CS" ? "Computer" : cs.subject.code === "PHY" ? "Physics" : "Chemistry")) : null;
      // Prefer a day that doesn't already have this subject.
      const ordered = [...slots].sort((a, b) => {
        const dayHas = (d: number) => entries.some((e) => e.sectionId === section.id && e.dayOfWeek === d && e.subjectId === cs.subjectId);
        return Number(dayHas(a.d)) - Number(dayHas(b.d)) || a.p.sortOrder - b.p.sortOrder;
      });
      const slot = ordered.find(({ d, p }) => !taken.has(`${d}:${p.id}`) && (!teacherId || !teacherBusy.has(`${teacherId}:${d}:${p.id}`)));
      if (!slot) continue;
      const roomId = lab && !roomBusy.has(`${lab.id}:${slot.d}:${slot.p.id}`) ? lab.id : section.roomId && !roomBusy.has(`${section.roomId}:${slot.d}:${slot.p.id}`) ? section.roomId : null;
      taken.add(`${slot.d}:${slot.p.id}`);
      if (teacherId) teacherBusy.add(`${teacherId}:${slot.d}:${slot.p.id}`);
      if (roomId) roomBusy.add(`${roomId}:${slot.d}:${slot.p.id}`);
      entries.push({ organizationId: orgId, campusId: section.campusId, sectionId: section.id, subjectId: cs.subjectId, teacherId, roomId, periodId: slot.p.id, dayOfWeek: slot.d });
    }
  }
  await db.timetableEntry.createMany({ data: entries });
  console.log(`• Timetable: bell schedules for 2 campuses, ${entries.length} weekly lessons (no clashes)`);
}
