import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { orgSettingsSchema } from "@/server/modules/organizations/settings";
import { computeResult, rankByScore } from "@/lib/grading";
import type { DemoContext } from "./demo";
import { createRandom } from "./random";

const r = createRandom(43);
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const ymd = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(new Date(d(s).getTime() + n * 86_400_000));
/** Skips Sundays. */
const schoolDays = (from: string, count: number) => {
  const out: string[] = [];
  for (let day = from; out.length < count; day = addDays(day, 1)) if (new Date(`${day}T00:00:00Z`).getUTCDay() !== 0) out.push(day);
  return out;
};

/** Box–Muller normal sample. */
const normal = (mean: number, sd: number) => mean + sd * Math.sqrt(-2 * Math.log(1 - r.next())) * Math.cos(2 * Math.PI * r.next());

/**
 * A published monthly test (marks for every student, results computed) and an
 * upcoming term exam with its date sheet, so every exam screen has real data.
 */
export async function seedExams(ctx: DemoContext, today = new Date().toISOString().slice(0, 10)) {
  const orgId = ctx.orgId;
  if ((await db.exam.count({ where: { organizationId: orgId } })) > 0) return;
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { settings: true } });
  const settings = orgSettingsSchema.parse(org.settings ?? {});
  const year = await db.academicYear.findFirst({ where: { organizationId: orgId, isCurrent: true } });
  const classes = await db.class.findMany({ where: { organizationId: orgId, deletedAt: null }, include: { subjects: true } });
  const admin = ctx.users.admin ?? null;

  // 1) Last month's test, fully marked and published.
  const testStart = addDays(`${today.slice(0, 7)}-01`, -17);
  const testDays = schoolDays(testStart, 6);
  const published = new Date(d(addDays(testDays[5]!, 4)));
  const test = await db.exam.create({
    data: {
      organizationId: orgId,
      academicYearId: year?.id ?? null,
      name: `${published.toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" })} monthly test`,
      type: "MONTHLY",
      startDate: d(testDays[0]!),
      endDate: d(testDays[5]!),
      status: "PUBLISHED",
      publishedAt: published,
      description: "Short tests of 50 marks in each subject.",
    },
  });
  const papers: Prisma.ExamSubjectCreateManyInput[] = classes.flatMap((c) =>
    c.subjects.map((s, i) => ({ organizationId: orgId, examId: test.id, classId: c.id, subjectId: s.subjectId, maxMarks: 50, passMarks: 20, date: d(testDays[i % testDays.length]!), startMinute: 8 * 60 + 30, endMinute: 9 * 60 + 30 })),
  );
  await db.examSubject.createMany({ data: papers });
  const testPapers = await db.examSubject.findMany({ where: { examId: test.id } });

  const students = await db.student.findMany({ where: { organizationId: orgId, status: "ACTIVE", archivedAt: null, classId: { not: null } }, select: { id: true, classId: true, sectionId: true } });
  const ability = new Map(students.map((s) => [s.id, Math.max(25, Math.min(97, normal(66, 15)))]));
  const marks: Prisma.MarkCreateManyInput[] = [];
  for (const s of students) {
    for (const p of testPapers.filter((x) => x.classId === s.classId)) {
      const absent = r.chance(0.015);
      const pct = Math.max(0, Math.min(100, normal(ability.get(s.id)!, 9)));
      marks.push({ organizationId: orgId, examSubjectId: p.id, studentId: s.id, isAbsent: absent, marksObtained: absent ? null : Math.round((pct / 100) * 50 * 2) / 2, enteredById: admin });
    }
  }
  for (let i = 0; i < marks.length; i += 5000) await db.mark.createMany({ data: marks.slice(i, i + 5000) });

  // Results, computed exactly as the app does.
  const computed = students.map((s) => {
    const mine = testPapers.filter((p) => p.classId === s.classId);
    const res = computeResult(
      mine.map((p) => {
        const m = marks.find((x) => x.examSubjectId === p.id && x.studentId === s.id);
        return { maxMarks: 50, passMarks: 20, marks: m?.marksObtained != null ? Number(m.marksObtained) : null, absent: !!m?.isAbsent, entered: !!m };
      }),
      settings.exams.gradingScale,
      settings.exams.passPercentage,
    );
    return { s, res };
  });
  const positions = new Map<string, number>();
  const bySection = new Map<string, typeof computed>();
  for (const c of computed) bySection.set(c.s.sectionId ?? "-", [...(bySection.get(c.s.sectionId ?? "-") ?? []), c]);
  for (const group of bySection.values()) for (const [id, pos] of rankByScore(group.map((c) => ({ id: c.s.id, score: c.res.status === "INCOMPLETE" ? null : c.res.percentage })))) positions.set(id, pos);
  await db.result.createMany({
    data: computed.map(({ s, res }) => ({
      organizationId: orgId,
      examId: test.id,
      studentId: s.id,
      totalObtained: res.totalObtained,
      totalMax: res.totalMax,
      percentage: res.percentage,
      grade: res.grade,
      status: res.status,
      position: positions.get(s.id) ?? null,
      computedAt: published,
      publishedAt: published,
    })),
  });

  // 2) The upcoming term exam: date sheet published, no marks yet.
  const termDays = schoolDays(addDays(today, 10), 8);
  const term = await db.exam.create({
    data: {
      organizationId: orgId,
      academicYearId: year?.id ?? null,
      name: "First term examination",
      type: "MIDTERM",
      startDate: d(termDays[0]!),
      endDate: d(termDays[termDays.length - 1]!),
      status: "SCHEDULED",
      description: "Students must arrive 15 minutes before each paper. Bring your admit card.",
    },
  });
  await db.examSubject.createMany({
    data: classes.flatMap((c) =>
      c.subjects.map((s, i) => ({ organizationId: orgId, examId: term.id, classId: c.id, subjectId: s.subjectId, maxMarks: 100, passMarks: 40, date: d(termDays[i % termDays.length]!), startMinute: 9 * 60, endMinute: c.level <= 5 ? 10 * 60 + 30 : 12 * 60 })),
    ),
  });
  console.log(`  exams: 2 exams, ${marks.length} marks, ${computed.length} results`);
}
