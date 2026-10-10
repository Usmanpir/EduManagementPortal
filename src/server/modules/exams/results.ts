import "server-only";
import { auditFor } from "@/server/audit";
import type { TenantContext } from "@/server/auth/context";
import { badRequest, notFound } from "@/server/http/errors";
import { accessibleSectionIds } from "@/server/modules/academics/scope";
import { fanout, guardianRecipients } from "@/server/modules/communication/fanout";
import { computeResult, gradeFor, rankByScore, type GradeBand } from "@/lib/grading";
import { toDateString } from "@/lib/format";
import { currentAcademicYear } from "@/server/modules/academics/service";
import { findExam } from "./service";

/**
 * (Re)computes every student's result for the exam from the marks entered.
 * Positions are within each section. Safe to run repeatedly.
 */
export async function computeResults(ctx: TenantContext, examId: string) {
  const exam = await findExam(ctx, examId);
  if (exam.status === "PUBLISHED") throw badRequest("Results are published. Unpublish them to recompute.");
  const { gradingScale, passPercentage } = ctx.settings.exams;
  const papers = await ctx.db.examSubject.findMany({ where: { examId }, include: { marks: true } });
  if (!papers.length) throw badRequest("This exam has no papers yet.");
  const classIds = [...new Set(papers.map((p) => p.classId))];
  const students = await ctx.db.student.findMany({ where: { classId: { in: classIds }, status: "ACTIVE", archivedAt: null }, select: { id: true, classId: true, sectionId: true } });

  const computed = students.map((s) => {
    const mine = papers.filter((p) => p.classId === s.classId);
    const r = computeResult(
      mine.map((p) => {
        const m = p.marks.find((x) => x.studentId === s.id);
        return { maxMarks: Number(p.maxMarks), passMarks: Number(p.passMarks), marks: m?.marksObtained != null ? Number(m.marksObtained) : null, absent: m?.isAbsent ?? false, entered: !!m };
      }),
      gradingScale,
      passPercentage,
    );
    return { student: s, ...r };
  });

  const positions = new Map<string, number>();
  const bySection = new Map<string, typeof computed>();
  for (const c of computed) {
    const key = c.student.sectionId ?? "none";
    bySection.set(key, [...(bySection.get(key) ?? []), c]);
  }
  for (const group of bySection.values()) {
    for (const [id, pos] of rankByScore(group.map((c) => ({ id: c.student.id, score: c.status === "INCOMPLETE" ? null : c.percentage })))) positions.set(id, pos);
  }

  await ctx.db.$transaction(async (tx) => {
    // Students who left the class since the last run lose their stale result.
    await tx.result.deleteMany({ where: { examId, studentId: { notIn: students.map((s) => s.id) } } });
    for (const c of computed) {
      const data = {
        totalObtained: c.totalObtained,
        totalMax: c.totalMax,
        percentage: c.percentage,
        grade: c.grade,
        status: c.status,
        position: positions.get(c.student.id) ?? null,
        computedAt: new Date(),
      };
      await tx.result.upsert({ where: { examId_studentId: { examId, studentId: c.student.id } }, create: { organizationId: ctx.orgId, examId, studentId: c.student.id, ...data }, update: data });
    }
  });
  const summary = {
    students: computed.length,
    pass: computed.filter((c) => c.status === "PASS").length,
    fail: computed.filter((c) => c.status === "FAIL").length,
    incomplete: computed.filter((c) => c.status === "INCOMPLETE").length,
  };
  await auditFor(ctx)({ action: "results.compute", entityType: "exam", entityId: examId, metadata: summary });
  return summary;
}

/** Publishing recomputes first, so what families see always matches the marks. */
export async function publishResults(ctx: TenantContext, examId: string, publish: boolean, notify: boolean) {
  const exam = await findExam(ctx, examId);
  if (!publish) {
    if (exam.status !== "PUBLISHED") return { notified: 0 };
    await ctx.db.$transaction([
      ctx.db.exam.update({ where: { id: examId }, data: { status: "SCHEDULED", publishedAt: null } }),
      ctx.db.result.updateMany({ where: { examId }, data: { publishedAt: null } }),
    ]);
    await auditFor(ctx)({ action: "results.unpublish", entityType: "exam", entityId: examId });
    return { notified: 0 };
  }
  if (exam.status === "PUBLISHED") return { notified: 0 };
  const summary = await computeResults(ctx, examId);
  if (summary.students === 0) throw badRequest("There are no students in this exam's classes.");
  const now = new Date();
  await ctx.db.$transaction([
    ctx.db.exam.update({ where: { id: examId }, data: { status: "PUBLISHED", publishedAt: now } }),
    ctx.db.result.updateMany({ where: { examId }, data: { publishedAt: now } }),
  ]);
  await auditFor(ctx)({ action: "results.publish", entityType: "exam", entityId: examId, metadata: summary });

  let notified = 0;
  if (notify) {
    const results = await ctx.db.result.findMany({ where: { examId, status: { not: "INCOMPLETE" } }, select: { studentId: true, student: { select: { firstName: true, lastName: true, userId: true } } } });
    const guardians = await guardianRecipients(ctx.orgId, results.map((r) => r.studentId));
    for (const r of results) {
      const name = `${r.student.firstName} ${r.student.lastName}`;
      const recipients = [...(guardians.get(r.studentId) ?? []), ...(r.student.userId ? [{ userId: r.student.userId }] : [])];
      if (!recipients.length) continue;
      await fanout(ctx.orgId, recipients, {
        type: "result.published",
        title: "Results published",
        body: `${exam.name} results for ${name} are now available.`,
        link: `/my/results?student=${r.studentId}&exam=${examId}`,
        entityType: "exam",
        entityId: examId,
        template: "result_published",
        payload: { examName: exam.name, studentName: name },
        dedupeKey: `results:${examId}:${r.studentId}:${now.getTime()}`,
      });
      notified++;
    }
  }
  return { notified, ...summary };
}

/** Result sheet for one section: every student with subject marks, total, grade and position. */
export async function sectionResults(ctx: TenantContext, examId: string, sectionId: string) {
  const exam = await findExam(ctx, examId);
  const sections = await accessibleSectionIds(ctx);
  if (sections && !sections.includes(sectionId)) throw notFound("Section");
  const section = await ctx.db.section.findFirst({ where: { id: sectionId, deletedAt: null }, include: { class: { select: { id: true, name: true } } } });
  if (!section) throw notFound("Section");
  const [papers, students, results] = await Promise.all([
    ctx.db.examSubject.findMany({ where: { examId, classId: section.classId }, include: { subject: { select: { name: true, code: true } }, marks: { where: { student: { sectionId } } } }, orderBy: [{ date: "asc" }, { subject: { name: "asc" } }] }),
    ctx.db.student.findMany({ where: { sectionId, status: "ACTIVE", archivedAt: null }, select: { id: true, firstName: true, lastName: true, rollNumber: true, admissionNo: true }, orderBy: [{ rollOrder: { sort: "asc", nulls: "last" } }, { firstName: "asc" }] }),
    ctx.db.result.findMany({ where: { examId, student: { sectionId } } }),
  ]);
  const resultBy = new Map(results.map((r) => [r.studentId, r]));
  const rows = students.map((s) => {
    const r = resultBy.get(s.id);
    return {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName}`,
      rollNumber: s.rollNumber,
      admissionNo: s.admissionNo,
      marks: papers.map((p) => {
        const m = p.marks.find((x) => x.studentId === s.id);
        return m ? (m.isAbsent ? ("ABS" as const) : Number(m.marksObtained)) : null;
      }),
      result: r ? { total: Number(r.totalObtained), max: Number(r.totalMax), percentage: Number(r.percentage), grade: r.grade, position: r.position, status: r.status } : null,
    };
  });
  const done = rows.filter((r) => r.result && r.result.status !== "INCOMPLETE");
  return {
    exam: { id: exam.id, name: exam.name, status: exam.status },
    section: { id: section.id, label: `${section.class.name}-${section.name}` },
    papers: papers.map((p) => ({ id: p.id, subject: p.subject.name, code: p.subject.code, maxMarks: Number(p.maxMarks), passMarks: Number(p.passMarks) })),
    rows,
    stats: {
      computed: results.length > 0,
      stale: results.length > 0 && papers.some((p) => p.marks.some((m) => results.every((r) => m.updatedAt > r.computedAt))),
      pass: done.filter((r) => r.result!.status === "PASS").length,
      fail: done.filter((r) => r.result!.status === "FAIL").length,
      incomplete: rows.length - done.length,
      average: done.length ? done.reduce((n, r) => n + r.result!.percentage, 0) / done.length : null,
      highest: done.length ? Math.max(...done.map((r) => r.result!.percentage)) : null,
    },
  };
}

/** Sections in the exam the user may view results for. */
export async function resultSections(ctx: TenantContext, examId: string) {
  await findExam(ctx, examId);
  const classIds = (await ctx.db.examSubject.findMany({ where: { examId }, select: { classId: true }, distinct: ["classId"] })).map((c) => c.classId);
  const allowed = await accessibleSectionIds(ctx);
  const sections = await ctx.db.section.findMany({
    where: { classId: { in: classIds }, deletedAt: null, ...(allowed ? { id: { in: allowed } } : {}), ...(ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}) },
    include: { class: { select: { name: true, level: true } } },
    orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
  });
  return sections.map((s) => ({ value: s.id, label: `${s.class.name}-${s.name}` }));
}

export type ReportCard = Awaited<ReturnType<typeof reportCards>>[number];

/**
 * Report cards for one student or a whole section. Students and parents only
 * ever get published results; staff see drafts marked as such.
 */
export async function reportCards(ctx: TenantContext, examId: string, opts: { sectionId?: string; studentIds?: string[] }) {
  const exam = await findExam(ctx, examId);
  const allowed = await accessibleSectionIds(ctx);
  const students = await ctx.db.student.findMany({
    where: {
      ...(opts.studentIds ? { id: { in: opts.studentIds } } : { sectionId: opts.sectionId }),
      ...(allowed ? { sectionId: { in: allowed } } : {}),
      ...(ctx.allowedCampusIds ? { campusId: { in: ctx.allowedCampusIds } } : {}),
    },
    select: { id: true, firstName: true, lastName: true, admissionNo: true, rollNumber: true, classId: true, sectionId: true, class: { select: { name: true } }, section: { select: { name: true } }, guardians: { where: { isPrimary: true }, take: 1, select: { guardian: { select: { firstName: true, lastName: true } } } } },
    orderBy: [{ rollOrder: { sort: "asc", nulls: "last" } }, { firstName: "asc" }],
  });
  return buildCards(ctx, exam, students);
}

/** Shared by staff and the parent/student portal (which supplies its own, already-authorized student list). */
export async function buildCards(
  ctx: TenantContext,
  exam: { id: string; name: string; status: string; startDate: Date; endDate: Date; publishedAt: Date | null },
  students: { id: string; firstName: string; lastName: string; admissionNo: string; rollNumber: string | null; classId: string | null; sectionId: string | null; class: { name: string } | null; section: { name: string } | null; guardians: { guardian: { firstName: string; lastName: string } }[] }[],
) {
  if (!students.length) return [];
  const scale = ctx.settings.exams.gradingScale as GradeBand[];
  const year = await currentAcademicYear(ctx);
  const classIds = [...new Set(students.map((s) => s.classId).filter((x): x is string => !!x))];
  const [papers, results, attendance] = await Promise.all([
    ctx.db.examSubject.findMany({ where: { examId: exam.id, classId: { in: classIds } }, include: { subject: { select: { name: true } }, marks: { where: { studentId: { in: students.map((s) => s.id) } } } }, orderBy: { subject: { name: "asc" } } }),
    ctx.db.result.findMany({ where: { examId: exam.id, studentId: { in: students.map((s) => s.id) } } }),
    ctx.db.attendance.groupBy({
      by: ["studentId", "status"],
      // Attendance for the academic year up to the end of the exam.
      where: { studentId: { in: students.map((s) => s.id) }, slot: "DAY", date: { lte: exam.endDate, ...(year ? { gte: year.startDate } : {}) } },
      _count: true,
    }),
  ]);
  // "Position 3 of 28": ranked students per section.
  const sectionIds = [...new Set(students.map((s) => s.sectionId).filter((x): x is string => !!x))];
  const ranked = sectionIds.length
    ? await ctx.db.result.findMany({ where: { examId: exam.id, status: { not: "INCOMPLETE" }, student: { sectionId: { in: sectionIds } } }, select: { student: { select: { sectionId: true } } } })
    : [];
  const sectionCounts = new Map<string, number>();
  for (const c of ranked) sectionCounts.set(c.student.sectionId!, (sectionCounts.get(c.student.sectionId!) ?? 0) + 1);
  const resultBy = new Map(results.map((r) => [r.studentId, r]));
  return students.map((s) => {
    const r = resultBy.get(s.id);
    const att = attendance.filter((a) => a.studentId === s.id);
    const count = (st: string) => att.find((a) => a.status === st)?._count ?? 0;
    const present = count("PRESENT") + count("LATE");
    const counted = present + count("ABSENT");
    const g = s.guardians[0]?.guardian;
    return {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName}`,
      admissionNo: s.admissionNo,
      rollNumber: s.rollNumber,
      className: s.class ? `${s.class.name}${s.section ? `-${s.section.name}` : ""}` : null,
      guardian: g ? `${g.firstName} ${g.lastName}` : null,
      exam: { id: exam.id, name: exam.name, published: exam.status === "PUBLISHED", from: toDateString(exam.startDate), to: toDateString(exam.endDate) },
      subjects: papers
        .filter((p) => p.classId === s.classId)
        .map((p) => {
          const m = p.marks.find((x) => x.studentId === s.id);
          const obtained = m && !m.isAbsent && m.marksObtained !== null ? Number(m.marksObtained) : null;
          const max = Number(p.maxMarks);
          return {
            subject: p.subject.name,
            maxMarks: max,
            passMarks: Number(p.passMarks),
            obtained,
            absent: m?.isAbsent ?? false,
            entered: !!m,
            grade: obtained !== null ? gradeFor((obtained / max) * 100, scale).grade : null,
            passed: obtained !== null && obtained >= Number(p.passMarks),
          };
        }),
      result: r
        ? { total: Number(r.totalObtained), max: Number(r.totalMax), percentage: Number(r.percentage), grade: r.grade, remark: gradeFor(Number(r.percentage), scale).remark, position: ctx.settings.exams.showPosition ? r.position : null, outOf: s.sectionId ? (sectionCounts.get(s.sectionId) ?? null) : null, status: r.status }
        : null,
      attendance: counted ? { present, total: counted, rate: (present / counted) * 100 } : null,
    };
  });
}
