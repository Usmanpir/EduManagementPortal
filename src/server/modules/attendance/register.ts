import "server-only";
import type { z } from "zod";
import type { AttendanceStatus } from "@/generated/prisma/enums";
import { auditFor } from "@/server/audit";
import { can, campusScope, type TenantContext } from "@/server/auth/context";
import { AppError, badRequest, forbidden, notFound } from "@/server/http/errors";
import { accessibleSectionIds, assertSectionAccess } from "@/server/modules/academics/scope";
import { fanout, guardianRecipients } from "@/server/modules/communication/fanout";
import { addDays, dateOnly, formatDate, isoWeekday, todayIn, toDateString } from "@/lib/format";
import type { correctionRequestSchema, saveRegisterSchema } from "@/lib/validation/attendance";

export const DAY_SLOT = "DAY";

export function daysBetween(from: string, to: string) {
  return Math.round((dateOnly(to).getTime() - dateOnly(from).getTime()) / 86_400_000);
}

export type RegisterAccess = "edit" | "request-correction" | "locked" | "future";

/** Whether this user may mark/edit attendance for a date. */
export function registerAccess(ctx: TenantContext, date: string, submitted: boolean): RegisterAccess {
  const today = todayIn(ctx.organization.timezone);
  if (date > today) return "future";
  if (can(ctx, "attendance.edit")) return "edit";
  if (!can(ctx, "attendance.mark")) return "locked";
  if (daysBetween(date, today) <= ctx.settings.attendance.teacherEditWindowDays) return "edit";
  return submitted ? "request-correction" : "locked";
}

async function resolveSlot(ctx: TenantContext, section: { campusId: string }, periodId: string | null) {
  if (ctx.settings.attendance.mode === "DAILY" || !periodId) {
    if (ctx.settings.attendance.mode === "PERIOD" && !periodId) throw badRequest("Choose the period you're taking attendance for.");
    return { slot: DAY_SLOT, period: null };
  }
  const period = await ctx.db.period.findFirst({ where: { id: periodId, campusId: section.campusId }, select: { id: true, name: true, startMinute: true, endMinute: true, isBreak: true } });
  if (!period || period.isBreak) throw notFound("Period");
  return { slot: period.id, period };
}

export async function getRegister(ctx: TenantContext, input: { sectionId: string; date: string; periodId: string | null }) {
  await assertSectionAccess(ctx, input.sectionId);
  const section = await ctx.db.section.findFirst({
    where: { id: input.sectionId, deletedAt: null, ...campusScope(ctx) },
    include: {
      class: { select: { id: true, name: true } },
      campus: { select: { name: true } },
      classTeacher: { select: { firstName: true, lastName: true } },
    },
  });
  if (!section) throw notFound("Section");
  const { slot, period } = await resolveSlot(ctx, section, input.periodId);
  const date = dateOnly(input.date);

  const [students, session, leaves, entry] = await Promise.all([
    ctx.db.student.findMany({
      where: { sectionId: section.id, status: "ACTIVE", archivedAt: null },
      orderBy: [{ rollOrder: { sort: "asc", nulls: "last" } }, { rollNumber: "asc" }, { firstName: "asc" }],
      select: { id: true, firstName: true, lastName: true, rollNumber: true, admissionNo: true, photoKey: true },
    }),
    ctx.db.attendanceSession.findUnique({ where: { sectionId_date_slot: { sectionId: section.id, date, slot } }, include: { records: true } }),
    ctx.db.leaveRequest.findMany({
      where: { requesterType: "STUDENT", status: "APPROVED", startDate: { lte: date }, endDate: { gte: date }, student: { sectionId: section.id } },
      select: { studentId: true, type: true },
    }),
    period
      ? ctx.db.timetableEntry.findFirst({
          where: { sectionId: section.id, periodId: period.id, dayOfWeek: isoWeekday(input.date) },
          include: { subject: { select: { name: true } }, teacher: { select: { staff: { select: { firstName: true, lastName: true } } } }, room: { select: { name: true } } },
        })
      : null,
  ]);

  const records = new Map(session?.records.map((r) => [r.studentId, r]) ?? []);
  const onLeave = new Map(leaves.map((l) => [l.studentId!, l.type]));
  const marker = session?.takenById ? await ctx.db.user.findFirst({ where: { id: session.takenById }, select: { firstName: true, lastName: true } }) : null;
  const pendingCorrections = session
    ? await ctx.db.attendanceCorrection.count({ where: { status: "PENDING", attendance: { sessionId: session.id } } })
    : 0;

  return {
    section: {
      id: section.id,
      name: section.name,
      classId: section.class.id,
      className: section.class.name,
      campusName: section.campus.name,
      classTeacher: section.classTeacher ? `${section.classTeacher.firstName} ${section.classTeacher.lastName}` : null,
    },
    date: input.date,
    period: period ? { id: period.id, name: period.name, startMinute: period.startMinute, endMinute: period.endMinute } : null,
    subject: entry?.subject.name ?? null,
    room: entry?.room?.name ?? null,
    isOffDay: ctx.settings.attendance.weeklyOffDays.includes(isoWeekday(input.date)),
    submittedAt: session?.submittedAt?.toISOString() ?? null,
    submittedBy: marker ? `${marker.firstName} ${marker.lastName}` : null,
    access: registerAccess(ctx, input.date, !!session?.submittedAt),
    pendingCorrections,
    students: students.map((s) => {
      const r = records.get(s.id);
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        rollNumber: s.rollNumber,
        admissionNo: s.admissionNo,
        status: (r?.status ?? (onLeave.has(s.id) ? "LEAVE" : null)) as AttendanceStatus | null,
        note: r?.note ?? null,
        approvedLeave: onLeave.get(s.id) ?? null,
      };
    }),
  };
}

function countStatuses(statuses: AttendanceStatus[]) {
  const c = { present: 0, absent: 0, late: 0, leave: 0 };
  for (const s of statuses) c[s.toLowerCase() as keyof typeof c]++;
  return c;
}

export async function saveRegister(ctx: TenantContext, input: z.output<typeof saveRegisterSchema>) {
  await assertSectionAccess(ctx, input.sectionId);
  const section = await ctx.db.section.findFirst({
    where: { id: input.sectionId, deletedAt: null },
    select: { id: true, campusId: true, name: true, class: { select: { name: true } } },
  });
  if (!section) throw notFound("Section");
  const { slot, period } = await resolveSlot(ctx, section, input.periodId);
  const date = dateOnly(input.date);

  const existing = await ctx.db.attendanceSession.findUnique({ where: { sectionId_date_slot: { sectionId: section.id, date, slot } }, include: { records: true } });
  const access = registerAccess(ctx, input.date, !!existing?.submittedAt);
  if (access === "future") throw badRequest("Attendance can't be marked for a future date.");
  if (access === "request-correction") throw new AppError("FORBIDDEN", "This register is locked. Request a correction instead.");
  if (access === "locked") throw forbidden("Only administrators can mark attendance for this date.");

  const active = await ctx.db.student.findMany({ where: { sectionId: section.id, status: "ACTIVE", archivedAt: null }, select: { id: true, firstName: true, lastName: true } });
  const activeIds = new Set(active.map((s) => s.id));
  const previous = new Map(existing?.records.map((r) => [r.studentId, r]) ?? []);
  for (const r of input.records) {
    if (!activeIds.has(r.studentId) && !previous.has(r.studentId)) throw badRequest("One of the students isn't in this section any more. Reload the register.");
  }
  const marked = new Set(input.records.map((r) => r.studentId));
  const missing = active.filter((s) => !marked.has(s.id));
  if (missing.length) {
    throw badRequest(`Mark every student before saving — ${missing.length} still ${missing.length === 1 ? "needs" : "need"} a status.`);
  }

  const counts = countStatuses(input.records.map((r) => r.status));
  const changes: { studentId: string; from: AttendanceStatus; to: AttendanceStatus }[] = [];
  for (const r of input.records) {
    const prev = previous.get(r.studentId);
    if (prev && prev.status !== r.status) changes.push({ studentId: r.studentId, from: prev.status, to: r.status });
  }

  await ctx.db.$transaction(async (tx) => {
    const session = await tx.attendanceSession.upsert({
      where: { sectionId_date_slot: { sectionId: section.id, date, slot } },
      create: {
        organizationId: ctx.orgId,
        campusId: section.campusId,
        sectionId: section.id,
        date,
        slot,
        periodId: period?.id ?? null,
        takenById: ctx.user.id,
        submittedAt: new Date(),
        presentCount: counts.present,
        absentCount: counts.absent,
        lateCount: counts.late,
        leaveCount: counts.leave,
      },
      update: { takenById: ctx.user.id, submittedAt: new Date(), presentCount: counts.present, absentCount: counts.absent, lateCount: counts.late, leaveCount: counts.leave },
    });
    for (const r of input.records) {
      const prev = previous.get(r.studentId);
      if (prev && prev.status === r.status && (prev.note ?? null) === (r.note ?? null)) continue;
      const saved = await tx.attendance.upsert({
        where: { studentId_date_slot: { studentId: r.studentId, date, slot } },
        create: {
          organizationId: ctx.orgId,
          campusId: section.campusId,
          sessionId: session.id,
          studentId: r.studentId,
          sectionId: section.id,
          date,
          slot,
          status: r.status,
          note: r.note,
          markedById: ctx.user.id,
        },
        update: { status: r.status, note: r.note, markedById: ctx.user.id, sessionId: session.id },
      });
      if (prev && prev.status !== r.status && existing?.submittedAt) {
        // Edits to a submitted register are kept as an approved correction for the audit trail.
        await tx.attendanceCorrection.create({
          data: {
            organizationId: ctx.orgId,
            attendanceId: saved.id,
            previousStatus: prev.status,
            newStatus: r.status,
            reason: "Edited directly",
            status: "APPROVED",
            requestedById: ctx.user.id,
            reviewedById: ctx.user.id,
            reviewedAt: new Date(),
          },
        });
      }
    }
  });

  await auditFor(ctx)({
    action: existing?.submittedAt ? "attendance.update" : "attendance.mark",
    entityType: "section",
    entityId: section.id,
    metadata: { date: input.date, slot, counts, changes },
  });

  const notified = await notifyAbsences(ctx, {
    date: input.date,
    slot,
    sectionLabel: `${section.class.name}-${section.name}`,
    students: input.records
      .filter((r) => (r.status === "ABSENT" || r.status === "LATE") && previous.get(r.studentId)?.status !== r.status)
      .map((r) => ({ ...r, ...active.find((s) => s.id === r.studentId)! })),
  });

  return { counts, total: input.records.length, notified, changed: changes.length };
}

/** Alerts guardians about today's absences/late arrivals (per organization settings). */
async function notifyAbsences(
  ctx: TenantContext,
  input: { date: string; slot: string; sectionLabel: string; students: { studentId: string; status: string; firstName: string; lastName: string }[] },
) {
  const settings = ctx.settings.attendance;
  if (input.date !== todayIn(ctx.organization.timezone)) return 0;
  const targets = input.students.filter((s) => (s.status === "ABSENT" && settings.notifyGuardiansOnAbsence) || (s.status === "LATE" && settings.notifyGuardiansOnLate));
  if (targets.length === 0) return 0;
  const guardians = await guardianRecipients(ctx.orgId, targets.map((t) => t.studentId));
  let notified = 0;
  for (const t of targets) {
    const recipients = guardians.get(t.studentId) ?? [];
    if (!recipients.length) continue;
    const name = `${t.firstName} ${t.lastName}`;
    const absent = t.status === "ABSENT";
    await fanout(ctx.orgId, recipients, {
      type: absent ? "attendance.absent" : "attendance.late",
      title: absent ? "Attendance alert" : "Late arrival",
      body: absent ? `${name} was marked absent today.` : `${name} arrived late today.`,
      link: `/my/attendance?student=${t.studentId}`,
      entityType: "student",
      entityId: t.studentId,
      template: absent ? "attendance_absent" : "attendance_late",
      payload: { studentName: name, sectionName: input.sectionLabel, date: formatDate(input.date, "long") },
      dedupeKey: `attendance:${t.status}:${t.studentId}:${input.date}`,
    });
    notified++;
  }
  return notified;
}

// ── Corrections ──

export async function requestCorrections(ctx: TenantContext, input: z.output<typeof correctionRequestSchema>) {
  await assertSectionAccess(ctx, input.sectionId);
  const section = await ctx.db.section.findFirst({ where: { id: input.sectionId, deletedAt: null }, select: { id: true, campusId: true } });
  if (!section) throw notFound("Section");
  const { slot } = await resolveSlot(ctx, section, input.periodId);
  const records = await ctx.db.attendance.findMany({
    where: { sectionId: section.id, date: dateOnly(input.date), slot, studentId: { in: input.changes.map((c) => c.studentId) } },
  });
  const byStudent = new Map(records.map((r) => [r.studentId, r]));
  const real = input.changes.filter((c) => byStudent.has(c.studentId) && byStudent.get(c.studentId)!.status !== c.status);
  if (real.length === 0) throw badRequest("Nothing changed — pick a different status for at least one student.");
  await ctx.db.attendanceCorrection.createMany({
    data: real.map((c) => ({
      organizationId: ctx.orgId,
      attendanceId: byStudent.get(c.studentId)!.id,
      previousStatus: byStudent.get(c.studentId)!.status,
      newStatus: c.status,
      reason: input.reason,
      requestedById: ctx.user.id,
    })),
  });
  await auditFor(ctx)({ action: "attendance.correction_request", entityType: "section", entityId: section.id, metadata: { date: input.date, count: real.length } });
  return real.length;
}

export async function listCorrections(ctx: TenantContext, status: "PENDING" | "APPROVED" | "REJECTED") {
  const allowed = await accessibleSectionIds(ctx);
  const rows = await ctx.db.attendanceCorrection.findMany({
    where: { status, attendance: { ...campusScope(ctx), ...(allowed ? { sectionId: { in: allowed } } : {}) } },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: {
      attendance: {
        select: {
          date: true,
          student: { select: { id: true, firstName: true, lastName: true } },
          section: { select: { name: true, class: { select: { name: true } } } },
        },
      },
    },
  });
  const userIds = [...new Set(rows.flatMap((r) => [r.requestedById, r.reviewedById]).filter((x): x is string => !!x))];
  const users = userIds.length ? await ctx.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const name = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  return rows.map((r) => ({
    id: r.id,
    date: toDateString(r.attendance.date),
    studentId: r.attendance.student.id,
    student: `${r.attendance.student.firstName} ${r.attendance.student.lastName}`,
    section: `${r.attendance.section.class.name} — ${r.attendance.section.name}`,
    from: r.previousStatus,
    to: r.newStatus,
    reason: r.reason,
    status: r.status,
    requestedBy: name.get(r.requestedById) ?? "Former user",
    reviewedBy: r.reviewedById ? (name.get(r.reviewedById) ?? "Former user") : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function reviewCorrection(ctx: TenantContext, id: string, decision: "APPROVED" | "REJECTED") {
  const correction = await ctx.db.attendanceCorrection.findFirst({ where: { id, status: "PENDING" }, include: { attendance: true } });
  if (!correction) throw notFound("Correction");
  await assertSectionAccess(ctx, correction.attendance.sectionId);
  if (correction.requestedById === ctx.user.id && decision === "APPROVED" && !can(ctx, "attendance.edit")) throw forbidden("You can't approve your own correction.");
  await ctx.db.$transaction(async (tx) => {
    await tx.attendanceCorrection.update({ where: { id }, data: { status: decision, reviewedById: ctx.user.id, reviewedAt: new Date() } });
    if (decision === "APPROVED") {
      await tx.attendance.update({ where: { id: correction.attendanceId }, data: { status: correction.newStatus, markedById: ctx.user.id } });
      const records = await tx.attendance.findMany({ where: { sessionId: correction.attendance.sessionId }, select: { status: true } });
      const c = countStatuses(records.map((r) => r.status));
      await tx.attendanceSession.update({
        where: { id: correction.attendance.sessionId },
        data: { presentCount: c.present, absentCount: c.absent, lateCount: c.late, leaveCount: c.leave },
      });
    }
  });
  await auditFor(ctx)({
    action: decision === "APPROVED" ? "attendance.correct" : "attendance.correction_reject",
    entityType: "student",
    entityId: correction.attendance.studentId,
    before: { status: correction.previousStatus },
    after: { status: decision === "APPROVED" ? correction.newStatus : correction.previousStatus },
  });
}

// ── Overview ──

export type OverviewItem = {
  key: string;
  sectionId: string;
  periodId: string | null;
  label: string;
  className: string;
  campusName: string;
  students: number;
  classTeacher: string | null;
  subject: string | null;
  time: string | null;
  startMinute: number | null;
  submitted: boolean;
  counts: { present: number; absent: number; late: number; leave: number };
  mine: boolean;
};

function hhmm(m: number) {
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Every register due on a date (one per section, or one per timetabled period). */
export async function attendanceOverview(ctx: TenantContext, date: string) {
  const allowed = await accessibleSectionIds(ctx);
  const sections = await ctx.db.section.findMany({
    where: { deletedAt: null, class: { deletedAt: null }, ...campusScope(ctx), ...(allowed ? { id: { in: allowed } } : {}) },
    orderBy: [{ campus: { isMain: "desc" } }, { class: { level: "asc" } }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      classTeacherId: true,
      class: { select: { name: true } },
      campus: { select: { name: true } },
      classTeacher: { select: { firstName: true, lastName: true } },
      _count: { select: { students: { where: { status: "ACTIVE", archivedAt: null } } } },
    },
  });
  const sectionIds = sections.map((s) => s.id);
  const sessions = await ctx.db.attendanceSession.findMany({ where: { sectionId: { in: sectionIds }, date: dateOnly(date) } });
  const sessionKey = new Map(sessions.map((s) => [`${s.sectionId}:${s.slot}`, s]));
  const mode = ctx.settings.attendance.mode;
  const multiCampus = new Set(sections.map((s) => s.campus.name)).size > 1;
  const items: OverviewItem[] = [];

  const base = (s: (typeof sections)[number]) => ({
    sectionId: s.id,
    className: s.class.name,
    campusName: s.campus.name,
    students: s._count.students,
    classTeacher: s.classTeacher ? `${s.classTeacher.firstName} ${s.classTeacher.lastName}` : null,
  });
  const counts = (session: (typeof sessions)[number] | undefined) => ({
    present: session?.presentCount ?? 0,
    absent: session?.absentCount ?? 0,
    late: session?.lateCount ?? 0,
    leave: session?.leaveCount ?? 0,
  });

  if (mode === "DAILY") {
    for (const s of sections) {
      const session = sessionKey.get(`${s.id}:${DAY_SLOT}`);
      items.push({
        key: s.id,
        ...base(s),
        periodId: null,
        label: `${s.class.name} — ${s.name}${multiCampus ? ` · ${s.campus.name}` : ""}`,
        subject: null,
        time: null,
        startMinute: null,
        submitted: !!session?.submittedAt,
        counts: counts(session),
        mine: !!ctx.staffId && s.classTeacherId === ctx.staffId,
      });
    }
  } else {
    const entries = await ctx.db.timetableEntry.findMany({
      where: { sectionId: { in: sectionIds }, dayOfWeek: isoWeekday(date) },
      include: { period: true, subject: { select: { name: true } } },
      orderBy: { period: { sortOrder: "asc" } },
    });
    for (const e of entries) {
      const s = sections.find((x) => x.id === e.sectionId)!;
      const session = sessionKey.get(`${s.id}:${e.periodId}`);
      items.push({
        key: `${s.id}:${e.periodId}`,
        ...base(s),
        periodId: e.periodId,
        label: `${s.class.name} — ${s.name}${multiCampus ? ` · ${s.campus.name}` : ""}`,
        subject: e.subject.name,
        time: `${hhmm(e.period.startMinute)} – ${hhmm(e.period.endMinute)}`,
        startMinute: e.period.startMinute,
        submitted: !!session?.submittedAt,
        counts: counts(session),
        mine: !!ctx.teacherId && e.teacherId === ctx.teacherId,
      });
    }
  }

  // Headline numbers: each student counted once per day (first register of the day in period mode).
  const daily = new Map<string, OverviewItem>();
  for (const i of items) if (i.submitted && !daily.has(i.sectionId)) daily.set(i.sectionId, i);
  const marked = [...daily.values()];
  const summary = {
    students: sections.reduce((n, s) => n + s._count.students, 0),
    present: marked.reduce((n, i) => n + i.counts.present, 0),
    absent: marked.reduce((n, i) => n + i.counts.absent, 0),
    late: marked.reduce((n, i) => n + i.counts.late, 0),
    leave: marked.reduce((n, i) => n + i.counts.leave, 0),
    registers: items.length,
    submitted: items.filter((i) => i.submitted).length,
  };
  return { mode, date, isOffDay: ctx.settings.attendance.weeklyOffDays.includes(isoWeekday(date)), summary, items, hasTimetable: mode === "DAILY" || items.length > 0 };
}

/** Attendance rate trend for the last N school days (used by dashboards and reports). */
export async function attendanceTrend(ctx: TenantContext, days = 14, endDate?: string) {
  const end = endDate ?? todayIn(ctx.organization.timezone);
  const start = addDays(end, -(days * 2));
  const allowed = await accessibleSectionIds(ctx);
  const rows = await ctx.db.attendanceSession.groupBy({
    by: ["date"],
    where: {
      date: { gte: dateOnly(start), lte: dateOnly(end) },
      slot: ctx.settings.attendance.mode === "DAILY" ? DAY_SLOT : undefined,
      ...campusScope(ctx),
      ...(allowed ? { sectionId: { in: allowed } } : {}),
    },
    _sum: { presentCount: true, absentCount: true, lateCount: true, leaveCount: true },
    orderBy: { date: "asc" },
  });
  return rows.slice(-days).map((r) => {
    const present = r._sum.presentCount ?? 0;
    const absent = r._sum.absentCount ?? 0;
    const late = r._sum.lateCount ?? 0;
    const counted = present + absent + late;
    return { date: toDateString(r.date), present, absent, late, leave: r._sum.leaveCount ?? 0, rate: counted ? ((present + late) / counted) * 100 : null };
  });
}
