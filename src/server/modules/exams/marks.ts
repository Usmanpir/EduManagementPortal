import "server-only";
import type { z } from "zod";
import { auditFor } from "@/server/audit";
import { can, type TenantContext } from "@/server/auth/context";
import { badRequest, forbidden, notFound } from "@/server/http/errors";
import { formatMinutes, toDateString } from "@/lib/format";
import type { saveMarksSchema } from "@/lib/validation/exams";
import { examScope } from "./service";

/**
 * Who may enter marks for a paper in a section: anyone with full data access,
 * the section's class teacher, or the teacher assigned that subject there.
 */
async function canEnterFor(ctx: TenantContext, sectionId: string, subjectId: string) {
  if (!can(ctx, "marks.enter")) return false;
  if (can(ctx, "records.all")) return true;
  if (!ctx.staffId) return false;
  const [classTeacher, assigned] = await Promise.all([
    ctx.db.section.count({ where: { id: sectionId, classTeacherId: ctx.staffId } }),
    ctx.teacherId ? ctx.db.teacherSubject.count({ where: { sectionId, subjectId, teacherId: ctx.teacherId } }) : 0,
  ]);
  return classTeacher > 0 || assigned > 0;
}

async function loadPaper(ctx: TenantContext, examSubjectId: string, sectionId: string) {
  const paper = await ctx.db.examSubject.findFirst({
    where: { id: examSubjectId, exam: examScope(ctx) },
    include: { exam: true, subject: { select: { id: true, name: true } }, class: { select: { id: true, name: true } } },
  });
  if (!paper) throw notFound("Paper");
  const section = await ctx.db.section.findFirst({ where: { id: sectionId, classId: paper.classId, deletedAt: null, ...(ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}) }, select: { id: true, name: true } });
  if (!section) throw notFound("Section");
  if (!(await canEnterFor(ctx, section.id, paper.subjectId))) throw forbidden("You don't teach this subject in this section.");
  return { paper, section };
}

/** The marks sheet: every active student in the section with their mark. */
export async function getMarksSheet(ctx: TenantContext, examSubjectId: string, sectionId: string) {
  const { paper, section } = await loadPaper(ctx, examSubjectId, sectionId);
  const [students, marks] = await Promise.all([
    ctx.db.student.findMany({
      where: { sectionId: section.id, status: "ACTIVE", archivedAt: null },
      select: { id: true, firstName: true, lastName: true, rollNumber: true, admissionNo: true },
      orderBy: [{ rollOrder: { sort: "asc", nulls: "last" } }, { firstName: "asc" }],
    }),
    ctx.db.mark.findMany({ where: { examSubjectId, student: { sectionId: section.id } } }),
  ]);
  const byStudent = new Map(marks.map((m) => [m.studentId, m]));
  const lastUpdate = marks.reduce<Date | null>((d, m) => (!d || m.updatedAt > d ? m.updatedAt : d), null);
  return {
    paper: {
      id: paper.id,
      examId: paper.examId,
      examName: paper.exam.name,
      published: paper.exam.status === "PUBLISHED",
      subject: paper.subject.name,
      className: paper.class.name,
      sectionId: section.id,
      sectionName: section.name,
      date: paper.date ? toDateString(paper.date) : null,
      time: paper.startMinute !== null ? formatMinutes(paper.startMinute) : null,
      maxMarks: Number(paper.maxMarks),
      passMarks: Number(paper.passMarks),
      lastUpdate: lastUpdate?.toISOString() ?? null,
    },
    students: students.map((s) => {
      const m = byStudent.get(s.id);
      return {
        id: s.id,
        name: `${s.firstName} ${s.lastName}`,
        rollNumber: s.rollNumber,
        admissionNo: s.admissionNo,
        marks: m?.marksObtained !== null && m?.marksObtained !== undefined ? Number(m.marksObtained) : null,
        absent: m?.isAbsent ?? false,
        remarks: m?.remarks ?? null,
      };
    }),
  };
}

export async function saveMarks(ctx: TenantContext, input: z.output<typeof saveMarksSchema>) {
  const { paper, section } = await loadPaper(ctx, input.examSubjectId, input.sectionId);
  if (paper.exam.status === "PUBLISHED") throw badRequest("Results for this exam are published. Ask an administrator to unpublish them to change marks.");
  const max = Number(paper.maxMarks);
  const fields: Record<string, string> = {};
  input.marks.forEach((m, i) => {
    if (!m.absent && m.marks !== null && m.marks > max) fields[`marks.${i}.marks`] = `Max ${max}.`;
  });
  if (Object.keys(fields).length) throw badRequest(`Marks can't be more than ${max}.`, fields);
  const valid = new Set(
    (await ctx.db.student.findMany({ where: { id: { in: input.marks.map((m) => m.studentId) }, sectionId: section.id }, select: { id: true } })).map((s) => s.id),
  );
  if (valid.size !== new Set(input.marks.map((m) => m.studentId)).size) throw badRequest("Some students aren't in this section any more. Reload the sheet.");

  let saved = 0;
  let cleared = 0;
  await ctx.db.$transaction(async (tx) => {
    for (const m of input.marks) {
      const empty = !m.absent && m.marks === null;
      if (empty) {
        cleared += (await tx.mark.deleteMany({ where: { examSubjectId: paper.id, studentId: m.studentId } })).count;
        continue;
      }
      const data = { marksObtained: m.absent ? null : m.marks, isAbsent: m.absent, remarks: m.remarks, enteredById: ctx.user.id };
      await tx.mark.upsert({
        where: { examSubjectId_studentId: { examSubjectId: paper.id, studentId: m.studentId } },
        create: { organizationId: ctx.orgId, examSubjectId: paper.id, studentId: m.studentId, ...data },
        update: data,
      });
      saved++;
    }
  });
  await auditFor(ctx)({ action: "marks.save", entityType: "exam_subject", entityId: paper.id, metadata: { sectionId: section.id, saved, cleared } });
  return { saved, cleared };
}

/** Papers (exam × subject × section) this user can enter marks for, with progress. */
export async function myPapers(ctx: TenantContext) {
  const full = can(ctx, "records.all");
  if (!full && !ctx.staffId) return [];
  const [assignments, classTeacherOf] = full
    ? [null, null]
    : await Promise.all([
        ctx.teacherId ? ctx.db.teacherSubject.findMany({ where: { teacherId: ctx.teacherId }, select: { sectionId: true, subjectId: true } }) : [],
        ctx.db.section.findMany({ where: { classTeacherId: ctx.staffId!, deletedAt: null }, select: { id: true } }),
      ]);

  const papers = await ctx.db.examSubject.findMany({
    where: { exam: { AND: [examScope(ctx), { status: { not: "PUBLISHED" } }] } },
    include: {
      exam: { select: { id: true, name: true, startDate: true } },
      subject: { select: { name: true } },
      class: { select: { name: true, level: true, sections: { where: { deletedAt: null, ...(ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } } } },
    },
    orderBy: [{ exam: { startDate: "desc" } }, { class: { level: "asc" } }, { date: "asc" }],
  });

  const rows = papers.flatMap((p) =>
    p.class.sections
      .filter((s) => full || classTeacherOf!.some((c) => c.id === s.id) || assignments!.some((a) => a.sectionId === s.id && a.subjectId === p.subjectId))
      .map((s) => ({ paper: p, section: s })),
  );
  if (!rows.length) return [];
  const sectionIds = [...new Set(rows.map((r) => r.section.id))];
  const [students, marks] = await Promise.all([
    ctx.db.student.groupBy({ by: ["sectionId"], where: { sectionId: { in: sectionIds }, status: "ACTIVE", archivedAt: null }, _count: true }),
    ctx.db.mark.findMany({ where: { examSubjectId: { in: [...new Set(rows.map((r) => r.paper.id))] }, student: { sectionId: { in: sectionIds } } }, select: { examSubjectId: true, student: { select: { sectionId: true } } } }),
  ]);
  const studentCount = new Map(students.map((s) => [s.sectionId, s._count]));
  const entered = new Map<string, number>();
  for (const m of marks) entered.set(`${m.examSubjectId}:${m.student.sectionId}`, (entered.get(`${m.examSubjectId}:${m.student.sectionId}`) ?? 0) + 1);

  return rows.map(({ paper: p, section: s }) => ({
    examSubjectId: p.id,
    sectionId: s.id,
    examId: p.exam.id,
    exam: p.exam.name,
    subject: p.subject.name,
    section: `${p.class.name}-${s.name}`,
    date: p.date ? toDateString(p.date) : null,
    students: studentCount.get(s.id) ?? 0,
    entered: entered.get(`${p.id}:${s.id}`) ?? 0,
  }));
}
