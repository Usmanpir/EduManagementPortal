import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { assertCampusAccess, type TenantContext } from "@/server/auth/context";
import { badRequest, conflict, notFound } from "@/server/http/errors";
import { currentAcademicYear } from "@/server/modules/academics/service";
import { dateOnly, formatMinutes, parseTime, todayIn, toDateString } from "@/lib/format";
import type { createExamSchema, examSchema, scheduleSchema } from "@/lib/validation/exams";

/** Exams this user can see: organization-wide ones plus their campuses'. */
export function examScope(ctx: TenantContext): Prisma.ExamWhereInput {
  return ctx.allowedCampusIds ? { OR: [{ campusId: null }, { campusId: { in: ctx.allowedCampusIds } }] } : {};
}

/** Stored status plus the date-derived phase people actually care about. */
export function examPhase(e: { status: string; startDate: Date; endDate: Date }, today: string) {
  if (e.status === "PUBLISHED") return "PUBLISHED" as const;
  if (e.status === "DRAFT") return "DRAFT" as const;
  const start = toDateString(e.startDate);
  const end = toDateString(e.endDate);
  return today < start ? ("SCHEDULED" as const) : today <= end ? ("ONGOING" as const) : ("COMPLETED" as const);
}

export async function findExam(ctx: TenantContext, id: string) {
  const exam = await ctx.db.exam.findFirst({ where: { AND: [{ id }, examScope(ctx)] } });
  if (!exam) throw notFound("Exam");
  return exam;
}

export async function listExams(ctx: TenantContext) {
  const today = todayIn(ctx.organization.timezone);
  const exams = await ctx.db.exam.findMany({
    where: examScope(ctx),
    orderBy: [{ startDate: "desc" }, { name: "asc" }],
    include: { subjects: { select: { classId: true, _count: { select: { marks: true } } } }, _count: { select: { results: true } } },
  });
  // Expected marks = students in each class × subjects of that class in the exam.
  const classIds = [...new Set(exams.flatMap((e) => e.subjects.map((s) => s.classId)))];
  const counts = classIds.length
    ? await ctx.db.student.groupBy({ by: ["classId"], where: { classId: { in: classIds }, status: "ACTIVE", archivedAt: null }, _count: true })
    : [];
  const students = new Map(counts.map((c) => [c.classId, c._count]));
  const campuses = await ctx.db.campus.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const campusName = new Map(campuses.map((c) => [c.id, c.name]));
  return exams.map((e) => {
    const expected = e.subjects.reduce((n, s) => n + (students.get(s.classId) ?? 0), 0);
    const entered = e.subjects.reduce((n, s) => n + s._count.marks, 0);
    return {
      id: e.id,
      name: e.name,
      type: e.type,
      startDate: toDateString(e.startDate),
      endDate: toDateString(e.endDate),
      status: e.status,
      phase: examPhase(e, today),
      campusName: e.campusId ? (campusName.get(e.campusId) ?? null) : null,
      classes: new Set(e.subjects.map((s) => s.classId)).size,
      papers: e.subjects.length,
      progress: expected ? Math.min(100, Math.round((entered / expected) * 100)) : 0,
      results: e._count.results,
    };
  });
}

/** Creates the exam and a paper for every subject each chosen class studies. */
export async function createExam(ctx: TenantContext, input: z.output<typeof createExamSchema>) {
  if (input.campusId) assertCampusAccess(ctx, input.campusId);
  if (input.passMarks > input.maxMarks) throw badRequest("Pass marks can't exceed total marks.", { passMarks: "More than the total." });
  const classes = await ctx.db.class.findMany({
    where: { id: { in: input.classIds }, deletedAt: null, ...(input.campusId ? { campusId: input.campusId } : ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}) },
    include: { subjects: { select: { subjectId: true } } },
  });
  if (classes.length !== input.classIds.length) throw badRequest("Some classes aren't on this campus.", { classIds: "Choose classes from the exam's campus." });
  const year = await currentAcademicYear(ctx);
  const exam = await ctx.db.exam.create({
    data: {
      organizationId: ctx.orgId,
      campusId: input.campusId,
      academicYearId: year?.id ?? null,
      name: input.name,
      type: input.type,
      startDate: dateOnly(input.startDate),
      endDate: dateOnly(input.endDate),
      description: input.description,
      subjects: {
        create: classes.flatMap((c) => c.subjects.map((s) => ({ organizationId: ctx.orgId, classId: c.id, subjectId: s.subjectId, maxMarks: input.maxMarks, passMarks: input.passMarks }))),
      },
    },
  });
  await auditFor(ctx)({ action: "exam.create", entityType: "exam", entityId: exam.id, after: input });
  return exam;
}

export async function updateExam(ctx: TenantContext, id: string, input: z.output<typeof examSchema>) {
  const before = await findExam(ctx, id);
  if (input.campusId) assertCampusAccess(ctx, input.campusId);
  const outside = await ctx.db.examSubject.count({ where: { examId: id, date: { not: null }, OR: [{ date: { lt: dateOnly(input.startDate) } }, { date: { gt: dateOnly(input.endDate) } }] } });
  if (outside) throw badRequest(`${outside} paper${outside === 1 ? " is" : "s are"} scheduled outside these dates. Update the date sheet first.`, { endDate: "Papers fall outside this range." });
  const after = await ctx.db.exam.update({
    where: { id },
    data: { name: input.name, type: input.type, startDate: dateOnly(input.startDate), endDate: dateOnly(input.endDate), campusId: input.campusId, description: input.description },
  });
  await auditFor(ctx)({ action: "exam.update", entityType: "exam", entityId: id, before, after });
  return after;
}

export async function deleteExam(ctx: TenantContext, id: string) {
  const exam = await findExam(ctx, id);
  const marks = await ctx.db.mark.count({ where: { examSubject: { examId: id } } });
  if (exam.status === "PUBLISHED" || marks > 0) throw conflict("This exam already has marks. It can't be deleted.");
  await ctx.db.exam.delete({ where: { id } });
  await auditFor(ctx)({ action: "exam.delete", entityType: "exam", entityId: id, before: exam });
}

export async function setExamStatus(ctx: TenantContext, id: string, status: "DRAFT" | "SCHEDULED") {
  const exam = await findExam(ctx, id);
  if (exam.status === "PUBLISHED") throw badRequest("Results are published. Unpublish them first.");
  await ctx.db.exam.update({ where: { id }, data: { status } });
  await auditFor(ctx)({ action: "exam.status", entityType: "exam", entityId: id, before: { status: exam.status }, after: { status } });
}

/** Full exam with its date sheet grouped by class. */
export async function getExam(ctx: TenantContext, id: string) {
  const exam = await findExam(ctx, id);
  const today = todayIn(ctx.organization.timezone);
  const papers = await ctx.db.examSubject.findMany({
    where: { examId: id },
    include: {
      class: { select: { id: true, name: true, level: true, campus: { select: { code: true } } } },
      subject: { select: { id: true, name: true, code: true, color: true } },
      room: { select: { id: true, name: true } },
      _count: { select: { marks: true } },
    },
    orderBy: [{ class: { level: "asc" } }, { date: "asc" }, { startMinute: "asc" }, { subject: { name: "asc" } }],
  });
  const classIds = [...new Set(papers.map((p) => p.classId))];
  const [sections, students] = await Promise.all([
    ctx.db.section.findMany({ where: { classId: { in: classIds }, deletedAt: null }, select: { id: true, name: true, classId: true }, orderBy: { name: "asc" } }),
    classIds.length ? ctx.db.student.groupBy({ by: ["classId"], where: { classId: { in: classIds }, status: "ACTIVE", archivedAt: null }, _count: true }) : [],
  ]);
  const studentCount = new Map(students.map((s) => [s.classId, s._count]));
  const multiCampus = new Set(papers.map((p) => p.class.campus.code)).size > 1;
  const classes = classIds.map((cid) => {
    const mine = papers.filter((p) => p.classId === cid);
    const c = mine[0]!.class;
    return {
      id: cid,
      name: multiCampus ? `${c.name} · ${c.campus.code}` : c.name,
      students: studentCount.get(cid) ?? 0,
      sections: sections.filter((s) => s.classId === cid).map((s) => ({ id: s.id, name: s.name })),
      papers: mine.map((p) => ({
        id: p.id,
        subjectId: p.subject.id,
        subject: p.subject.name,
        code: p.subject.code,
        color: p.subject.color,
        date: p.date ? toDateString(p.date) : null,
        start: p.startMinute !== null ? formatMinutes(p.startMinute) : null,
        end: p.endMinute !== null ? formatMinutes(p.endMinute) : null,
        roomId: p.room?.id ?? null,
        room: p.room?.name ?? null,
        maxMarks: Number(p.maxMarks),
        passMarks: Number(p.passMarks),
        marksEntered: p._count.marks,
      })),
    };
  });
  return {
    id: exam.id,
    name: exam.name,
    type: exam.type,
    status: exam.status,
    phase: examPhase(exam, today),
    startDate: toDateString(exam.startDate),
    endDate: toDateString(exam.endDate),
    campusId: exam.campusId,
    description: exam.description,
    publishedAt: exam.publishedAt?.toISOString() ?? null,
    classes,
  };
}

/** Replaces one class's papers (date sheet rows). Papers that already have marks can't be removed. */
export async function saveSchedule(ctx: TenantContext, examId: string, input: z.output<typeof scheduleSchema>) {
  const exam = await findExam(ctx, examId);
  if (exam.status === "PUBLISHED") throw badRequest("Results are published. Unpublish them before changing papers.");
  const cls = await ctx.db.class.findFirst({ where: { id: input.classId, deletedAt: null, ...(ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}) }, select: { id: true, campusId: true } });
  if (!cls) throw notFound("Class");
  if (exam.campusId && cls.campusId !== exam.campusId) throw badRequest("That class is on a different campus.");

  const start = toDateString(exam.startDate);
  const end = toDateString(exam.endDate);
  const fields: Record<string, string> = {};
  input.subjects.forEach((s, i) => {
    if (s.date && (s.date < start || s.date > end)) fields[`subjects.${i}.date`] = "Outside the exam dates.";
  });
  const seen = new Set<string>();
  input.subjects.forEach((s, i) => {
    if (seen.has(s.subjectId)) fields[`subjects.${i}.subjectId`] = "Listed twice.";
    seen.add(s.subjectId);
  });
  if (Object.keys(fields).length) throw badRequest("Please fix the highlighted papers.", fields);
  const roomIds = input.subjects.map((s) => s.roomId).filter((x): x is string => !!x);
  if (roomIds.length && (await ctx.db.room.count({ where: { id: { in: [...new Set(roomIds)] }, deletedAt: null } })) !== new Set(roomIds).size) throw notFound("Room");
  if ((await ctx.db.subject.count({ where: { id: { in: [...seen] } } })) !== seen.size) throw notFound("Subject");

  const existing = await ctx.db.examSubject.findMany({ where: { examId, classId: cls.id }, include: { _count: { select: { marks: true } } } });
  const removed = existing.filter((e) => !seen.has(e.subjectId));
  const locked = removed.filter((e) => e._count.marks > 0);
  if (locked.length) throw conflict("Some removed papers already have marks. Clear their marks first.");

  await ctx.db.$transaction(async (tx) => {
    if (removed.length) await tx.examSubject.deleteMany({ where: { id: { in: removed.map((r) => r.id) } } });
    for (const s of input.subjects) {
      const data = {
        date: s.date ? dateOnly(s.date) : null,
        startMinute: s.start ? parseTime(s.start) : null,
        endMinute: s.end ? parseTime(s.end) : null,
        roomId: s.roomId,
        maxMarks: s.maxMarks,
        passMarks: s.passMarks,
      };
      const hit = existing.find((e) => e.subjectId === s.subjectId);
      if (hit) {
        // Shrinking total marks below an entered score would corrupt results.
        if (hit._count.marks && s.maxMarks < Number(hit.maxMarks)) {
          const over = await tx.mark.count({ where: { examSubjectId: hit.id, marksObtained: { gt: s.maxMarks } } });
          if (over) throw badRequest(`${over} student${over === 1 ? " has" : "s have"} more than ${s.maxMarks} marks in this paper.`);
        }
        await tx.examSubject.update({ where: { id: hit.id }, data });
      } else {
        await tx.examSubject.create({ data: { organizationId: ctx.orgId, examId, classId: cls.id, subjectId: s.subjectId, ...data } });
      }
    }
  });
  await auditFor(ctx)({ action: "exam.schedule", entityType: "exam", entityId: examId, metadata: { classId: cls.id, papers: input.subjects.length } });
}

/** Options for the exam forms: classes (with campus) and rooms. */
export async function examLookups(ctx: TenantContext) {
  const campusWhere = ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {};
  const [campuses, classes, rooms, subjects] = await Promise.all([
    ctx.db.campus.findMany({ where: { deletedAt: null, ...campusWhere }, select: { id: true, name: true, code: true }, orderBy: [{ isMain: "desc" }, { name: "asc" }] }),
    ctx.db.class.findMany({ where: { deletedAt: null, ...(ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}) }, select: { id: true, name: true, campusId: true, _count: { select: { subjects: true } } }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
    ctx.db.room.findMany({ where: { deletedAt: null, ...(ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}) }, select: { id: true, name: true, campusId: true }, orderBy: { name: "asc" } }),
    ctx.db.subject.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const multi = campuses.length > 1;
  const code = new Map(campuses.map((c) => [c.id, c.code]));
  return {
    campuses: campuses.map((c) => ({ value: c.id, label: c.name })),
    classes: classes.map((c) => ({ value: c.id, label: multi ? `${c.name} · ${code.get(c.campusId)}` : c.name, campusId: c.campusId, subjects: c._count.subjects })),
    rooms: rooms.map((r) => ({ value: r.id, label: r.name, campusId: r.campusId })),
    subjects: subjects.map((s) => ({ value: s.id, label: s.name })),
  };
}
