import "server-only";
import type { z } from "zod";
import { auditFor } from "@/server/audit";
import { assertCampusAccess, campusScope, can, type TenantContext } from "@/server/auth/context";
import { badRequest, conflict, forbidden, notFound } from "@/server/http/errors";
import { accessibleSectionIds } from "@/server/modules/academics/scope";
import { formatMinutes, isoWeekday, parseTime, todayIn } from "@/lib/format";
import type { periodsSchema, timetableEntrySchema } from "@/lib/validation/timetable";

export const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** School days for the organization (everything that isn't a weekly day off). */
export function schoolDays(ctx: TenantContext) {
  return [1, 2, 3, 4, 5, 6, 7].filter((d) => !ctx.settings.attendance.weeklyOffDays.includes(d));
}

// ── Periods (the bell schedule) ──

export async function listPeriods(ctx: TenantContext, campusId: string) {
  assertCampusAccess(ctx, campusId);
  return ctx.db.period.findMany({ where: { campusId }, orderBy: { sortOrder: "asc" } });
}

export async function savePeriods(ctx: TenantContext, input: z.output<typeof periodsSchema>) {
  assertCampusAccess(ctx, input.campusId);
  if (!(await ctx.db.campus.findFirst({ where: { id: input.campusId, deletedAt: null }, select: { id: true } }))) throw notFound("Campus");
  const existing = await ctx.db.period.findMany({ where: { campusId: input.campusId }, include: { _count: { select: { timetableEntries: true } } } });
  const keep = new Set(input.periods.map((p) => p.id).filter(Boolean));
  const removed = existing.filter((p) => !keep.has(p.id));
  const blocking = removed.filter((p) => p._count.timetableEntries > 0);
  if (blocking.length) throw badRequest(`“${blocking[0]!.name}” has lessons scheduled. Clear them from the timetable before removing the period.`);
  for (const p of input.periods) {
    if (p.id && !existing.some((e) => e.id === p.id)) throw notFound("Period");
    if (p.isBreak && p.id && (existing.find((e) => e.id === p.id)?._count.timetableEntries ?? 0) > 0) {
      throw badRequest(`“${p.name}” has lessons scheduled, so it can't become a break.`);
    }
  }

  await ctx.db.$transaction(async (tx) => {
    await tx.period.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
    // Move existing sort orders out of the way to avoid unique clashes while reordering.
    await tx.period.updateMany({ where: { campusId: input.campusId }, data: { sortOrder: { increment: 1000 } } });
    for (const [i, p] of input.periods.entries()) {
      const data = { name: p.name, startMinute: parseTime(p.start), endMinute: parseTime(p.end), sortOrder: i + 1, isBreak: p.isBreak };
      if (p.id) await tx.period.update({ where: { id: p.id }, data });
      else await tx.period.create({ data: { organizationId: ctx.orgId, campusId: input.campusId, ...data } });
    }
  });
  await auditFor(ctx)({ action: "timetable.periods_update", entityType: "campus", entityId: input.campusId, after: input.periods });
}

// ── Timetable views ──

export type TimetableKind = "section" | "teacher" | "room";

/**
 * `authorized` is for callers that already proved access some other way
 * (the family portal: the section of the user's own child).
 */
export async function getTimetable(ctx: TenantContext, kind: TimetableKind, id: string, opts: { authorized?: boolean } = {}) {
  let campusId: string;
  let title: string;
  if (kind === "section") {
    if (!opts.authorized) {
      const allowed = await accessibleSectionIds(ctx);
      if (allowed && !allowed.includes(id)) throw forbidden();
    }
    const s = await ctx.db.section.findFirst({ where: { id, deletedAt: null, ...(opts.authorized ? {} : campusScope(ctx)) }, select: { campusId: true, name: true, class: { select: { name: true } } } });
    if (!s) throw notFound("Section");
    campusId = s.campusId;
    title = `${s.class.name} — Section ${s.name}`;
  } else if (kind === "teacher") {
    const t = await ctx.db.teacher.findFirst({ where: { id, staff: { deletedAt: null, ...campusScope(ctx) } }, select: { staff: { select: { campusId: true, firstName: true, lastName: true } } } });
    if (!t) throw notFound("Teacher");
    if (!can(ctx, "timetable.view") && ctx.teacherId !== id) throw forbidden();
    campusId = t.staff.campusId;
    title = `${t.staff.firstName} ${t.staff.lastName}`;
  } else {
    const r = await ctx.db.room.findFirst({ where: { id, deletedAt: null, ...campusScope(ctx) }, select: { campusId: true, name: true } });
    if (!r) throw notFound("Room");
    campusId = r.campusId;
    title = r.name;
  }

  const [periods, entries] = await Promise.all([
    ctx.db.period.findMany({ where: { campusId }, orderBy: { sortOrder: "asc" } }),
    ctx.db.timetableEntry.findMany({
      where: kind === "section" ? { sectionId: id } : kind === "teacher" ? { teacherId: id } : { roomId: id },
      include: {
        subject: { select: { id: true, name: true, code: true, color: true } },
        teacher: { select: { id: true, staff: { select: { firstName: true, lastName: true } } } },
        room: { select: { id: true, name: true } },
        section: { select: { id: true, name: true, class: { select: { name: true } } } },
      },
    }),
  ]);
  return {
    kind,
    id,
    title,
    campusId,
    days: schoolDays(ctx),
    periods: periods.map((p) => ({ id: p.id, name: p.name, start: formatMinutes(p.startMinute), end: formatMinutes(p.endMinute), isBreak: p.isBreak })),
    entries: entries.map((e) => ({
      id: e.id,
      dayOfWeek: e.dayOfWeek,
      periodId: e.periodId,
      sectionId: e.sectionId,
      section: `${e.section.class.name}-${e.section.name}`,
      subjectId: e.subject.id,
      subject: e.subject.name,
      subjectCode: e.subject.code,
      color: e.subject.color,
      teacherId: e.teacher?.id ?? null,
      teacher: e.teacher ? `${e.teacher.staff.firstName} ${e.teacher.staff.lastName}` : null,
      roomId: e.room?.id ?? null,
      room: e.room?.name ?? null,
    })),
  };
}

/** Options for the cell editor: the class' subjects, who usually teaches each, rooms. */
export async function sectionEditorOptions(ctx: TenantContext, sectionId: string) {
  const section = await ctx.db.section.findFirst({ where: { id: sectionId, deletedAt: null }, select: { classId: true, campusId: true, roomId: true } });
  if (!section) throw notFound("Section");
  const [subjects, assignments, teachers, rooms] = await Promise.all([
    ctx.db.classSubject.findMany({ where: { classId: section.classId }, include: { subject: { select: { id: true, name: true, color: true } } }, orderBy: { subject: { name: "asc" } } }),
    ctx.db.teacherSubject.findMany({ where: { sectionId }, select: { subjectId: true, teacherId: true } }),
    ctx.db.teacher.findMany({ where: { staff: { campusId: section.campusId, deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } } }, select: { id: true, staff: { select: { firstName: true, lastName: true } } }, orderBy: { staff: { firstName: "asc" } } }),
    ctx.db.room.findMany({ where: { campusId: section.campusId, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const scheduled = await ctx.db.timetableEntry.groupBy({ by: ["subjectId"], where: { sectionId }, _count: { _all: true } });
  return {
    homeRoomId: section.roomId,
    subjects: subjects.map((s) => ({
      id: s.subject.id,
      name: s.subject.name,
      color: s.subject.color,
      periodsPerWeek: s.periodsPerWeek,
      scheduled: scheduled.find((x) => x.subjectId === s.subject.id)?._count._all ?? 0,
      teacherId: assignments.find((a) => a.subjectId === s.subject.id)?.teacherId ?? null,
    })),
    teachers: teachers.map((t) => ({ id: t.id, name: `${t.staff.firstName} ${t.staff.lastName}` })),
    rooms,
  };
}

/** Creates or replaces the lesson in one slot, refusing teacher/room double-booking. */
export async function setTimetableEntry(ctx: TenantContext, input: z.output<typeof timetableEntrySchema>) {
  const section = await ctx.db.section.findFirst({ where: { id: input.sectionId, deletedAt: null }, select: { campusId: true, classId: true, name: true, class: { select: { name: true } } } });
  if (!section) throw notFound("Section");
  assertCampusAccess(ctx, section.campusId);
  const [period, offered] = await Promise.all([
    ctx.db.period.findFirst({ where: { id: input.periodId, campusId: section.campusId } }),
    ctx.db.classSubject.findFirst({ where: { classId: section.classId, subjectId: input.subjectId }, select: { id: true } }),
  ]);
  if (!period) throw notFound("Period");
  if (period.isBreak) throw badRequest("Lessons can't be scheduled in a break.");
  if (!offered) throw badRequest("Add this subject to the class first.");
  if (!schoolDays(ctx).includes(input.dayOfWeek)) throw badRequest("That's a day off.");

  const slot = { dayOfWeek: input.dayOfWeek, periodId: input.periodId, NOT: { sectionId: input.sectionId } };
  const when = `${DAY_NAMES[input.dayOfWeek - 1]} ${period.name}`;
  if (input.teacherId) {
    const teacher = await ctx.db.teacher.findFirst({ where: { id: input.teacherId, staff: { deletedAt: null } }, select: { staff: { select: { firstName: true, lastName: true, campusId: true } } } });
    if (!teacher) throw notFound("Teacher");
    const busy = await ctx.db.timetableEntry.findFirst({ where: { ...slot, teacherId: input.teacherId }, include: { section: { select: { name: true, class: { select: { name: true } } } } } });
    if (busy) {
      const msg = `${teacher.staff.firstName} ${teacher.staff.lastName} already teaches ${busy.section.class.name}-${busy.section.name} on ${when}.`;
      throw conflict(msg, { teacherId: msg });
    }
  }
  if (input.roomId) {
    const room = await ctx.db.room.findFirst({ where: { id: input.roomId, campusId: section.campusId, deletedAt: null }, select: { name: true } });
    if (!room) throw notFound("Room");
    const busy = await ctx.db.timetableEntry.findFirst({ where: { ...slot, roomId: input.roomId }, include: { section: { select: { name: true, class: { select: { name: true } } } } } });
    if (busy) {
      const msg = `${room.name} is already booked by ${busy.section.class.name}-${busy.section.name} on ${when}.`;
      throw conflict(msg, { roomId: msg });
    }
  }

  const data = { subjectId: input.subjectId, teacherId: input.teacherId, roomId: input.roomId };
  const entry = await ctx.db.timetableEntry.upsert({
    where: { sectionId_dayOfWeek_periodId: { sectionId: input.sectionId, dayOfWeek: input.dayOfWeek, periodId: input.periodId } },
    create: { organizationId: ctx.orgId, campusId: section.campusId, sectionId: input.sectionId, dayOfWeek: input.dayOfWeek, periodId: input.periodId, ...data },
    update: data,
  });
  await auditFor(ctx)({ action: "timetable.set", entityType: "section", entityId: input.sectionId, after: input });
  return entry;
}

export async function clearTimetableEntry(ctx: TenantContext, id: string) {
  const entry = await ctx.db.timetableEntry.findFirst({ where: { id } });
  if (!entry) throw notFound("Lesson");
  assertCampusAccess(ctx, entry.campusId);
  await ctx.db.timetableEntry.delete({ where: { id } });
  await auditFor(ctx)({ action: "timetable.clear", entityType: "section", entityId: entry.sectionId, before: entry });
}

/** A teacher's lessons for one date (dashboards, "today's classes"). */
export async function teacherDay(ctx: TenantContext, teacherId: string, date = todayIn(ctx.organization.timezone)) {
  const entries = await ctx.db.timetableEntry.findMany({
    where: { teacherId, dayOfWeek: isoWeekday(date) },
    include: { period: true, subject: { select: { name: true, color: true } }, room: { select: { name: true } }, section: { select: { id: true, name: true, class: { select: { name: true } } } } },
    orderBy: { period: { sortOrder: "asc" } },
  });
  return entries.map((e) => ({
    id: e.id,
    periodId: e.periodId,
    sectionId: e.section.id,
    section: `${e.section.class.name} — ${e.section.name}`,
    subject: e.subject.name,
    color: e.subject.color,
    room: e.room?.name ?? null,
    start: formatMinutes(e.period.startMinute),
    end: formatMinutes(e.period.endMinute),
    startMinute: e.period.startMinute,
    endMinute: e.period.endMinute,
  }));
}

/** Pickers for the timetable page. */
export async function timetablePickers(ctx: TenantContext) {
  const allowed = await accessibleSectionIds(ctx);
  const [sections, teachers, rooms] = await Promise.all([
    ctx.db.section.findMany({
      where: { deletedAt: null, class: { deletedAt: null }, ...campusScope(ctx), ...(allowed ? { id: { in: allowed } } : {}) },
      select: { id: true, name: true, campus: { select: { code: true } }, class: { select: { name: true } } },
      orderBy: [{ campus: { isMain: "desc" } }, { class: { level: "asc" } }, { name: "asc" }],
    }),
    can(ctx, "teachers.view") || can(ctx, "timetable.manage")
      ? ctx.db.teacher.findMany({ where: { staff: { deletedAt: null, ...campusScope(ctx) } }, select: { id: true, staff: { select: { firstName: true, lastName: true } } }, orderBy: { staff: { firstName: "asc" } } })
      : ctx.teacherId
        ? ctx.db.teacher.findMany({ where: { id: ctx.teacherId }, select: { id: true, staff: { select: { firstName: true, lastName: true } } } })
        : [],
    ctx.db.room.findMany({ where: { deletedAt: null, ...campusScope(ctx) }, select: { id: true, name: true, campus: { select: { code: true } } }, orderBy: { name: "asc" } }),
  ]);
  const multi = new Set(sections.map((s) => s.campus.code)).size > 1;
  return {
    sections: sections.map((s) => ({ value: s.id, label: `${s.class.name} — ${s.name}${multi ? ` · ${s.campus.code}` : ""}` })),
    teachers: teachers.map((t) => ({ value: t.id, label: `${t.staff.firstName} ${t.staff.lastName}` })),
    rooms: rooms.map((r) => ({ value: r.id, label: `${r.name}${multi ? ` · ${r.campus.code}` : ""}` })),
  };
}
