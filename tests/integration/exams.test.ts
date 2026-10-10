import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { POST as createClass } from "@/app/api/classes/route";
import { POST as createSubject } from "@/app/api/subjects/route";
import { PUT as setClassSubjects } from "@/app/api/classes/[id]/subjects/route";
import { POST as createExam } from "@/app/api/exams/route";
import { GET as getExam } from "@/app/api/exams/[id]/route";
import { PUT as saveSchedule } from "@/app/api/exams/[id]/schedule/route";
import { GET as getResults, POST as computeResults } from "@/app/api/exams/[id]/results/route";
import { POST as publish } from "@/app/api/exams/[id]/publish/route";
import { GET as getSheet, PUT as saveMarks } from "@/app/api/marks/route";
import { addDays, todayIn } from "@/lib/format";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

const today = () => todayIn("Asia/Karachi");

/** One class (sections A & B), two subjects, three students in A, a subject teacher for Maths in A. */
async function school(name = "School") {
  const org = await createOrg(name);
  await signInAs(org.admin.id);
  const cls = await call<{ id: string }>(createClass, { body: { name: "Grade 8", level: 8, campusId: org.campus.id, sections: ["A", "B"] } });
  const [a, b] = await db.section.findMany({ where: { classId: cls.data.id }, orderBy: { name: "asc" } });
  const sfx = Date.now() % 100000;
  const maths = await call<{ id: string }>(createSubject, { body: { name: "Maths", code: `M${sfx}`, type: "CORE" } });
  const eng = await call<{ id: string }>(createSubject, { body: { name: "English", code: `E${sfx}`, type: "CORE" } });
  await call(setClassSubjects, { method: "PUT", params: { id: cls.data.id }, body: { subjects: [{ subjectId: maths.data.id }, { subjectId: eng.data.id }] } });
  const mk = (first: string, n: number) => db.student.create({ data: { organizationId: org.org.id, campusId: org.campus.id, classId: cls.data.id, sectionId: a!.id, admissionNo: `X-${first}-${Date.now()}-${n}`, rollNumber: String(n), rollOrder: n, firstName: first, lastName: "Test" } });
  const students = [await mk("Ali", 1), await mk("Sara", 2), await mk("Zain", 3)];

  const teacherUser = await createUser({ organizationId: org.org.id, roles: org.roles }, "teacher");
  const staff = await db.staff.create({ data: { organizationId: org.org.id, campusId: org.campus.id, userId: teacherUser.id, employeeCode: `T-${Date.now()}`, firstName: "Sana", lastName: "Teacher", designation: "Teacher" } });
  const teacher = await db.teacher.create({ data: { organizationId: org.org.id, staffId: staff.id } });
  await db.teacherSubject.create({ data: { organizationId: org.org.id, teacherId: teacher.id, sectionId: a!.id, subjectId: maths.data.id } });

  const exam = await call<{ id: string }>(createExam, { body: { name: "Mid-term", type: "MIDTERM", startDate: today(), endDate: addDays(today(), 5), classIds: [cls.data.id], maxMarks: 100, passMarks: 40 } });
  expect(exam.status).toBe(201);
  const papers = await db.examSubject.findMany({ where: { examId: exam.data.id } });
  const paper = (subjectId: string) => papers.find((p) => p.subjectId === subjectId)!;
  return { ...org, classId: cls.data.id, a: a!, b: b!, students, teacherUser, examId: exam.data.id, mathsPaper: paper(maths.data.id), engPaper: paper(eng.data.id), mathsId: maths.data.id, engId: eng.data.id };
}

const marks = (students: { id: string }[], values: (number | "A" | null)[]) => students.map((s, i) => ({ studentId: s.id, marks: values[i] === "A" ? null : values[i], absent: values[i] === "A" }));

describe("exams", () => {
  it("creates a paper per class subject and validates the date sheet", async () => {
    const s = await school();
    const exam = await call<{ classes: { papers: unknown[] }[] }>(getExam, { params: { id: s.examId } });
    expect(exam.data.classes[0]!.papers).toHaveLength(2);
    const bad = await call(saveSchedule, {
      method: "PUT",
      params: { id: s.examId },
      body: { classId: s.classId, subjects: [{ subjectId: s.mathsId, date: addDays(today(), 30), maxMarks: 100, passMarks: 40 }, { subjectId: s.engId, maxMarks: 50, passMarks: 60 }] },
    });
    expect(bad.status).toBe(422);
    const okRes = await call(saveSchedule, { method: "PUT", params: { id: s.examId }, body: { classId: s.classId, subjects: [{ subjectId: s.mathsId, date: today(), start: "09:00", end: "11:00", maxMarks: 100, passMarks: 40 }] } });
    expect(okRes.status).toBe(200);
    expect(await db.examSubject.count({ where: { examId: s.examId } })).toBe(1);
  });

  it("subject teachers enter marks only for their own subject and section", async () => {
    const s = await school();
    await signInAs(s.teacherUser.id);
    const sheet = await call<{ students: unknown[] }>(getSheet, { query: { examSubjectId: s.mathsPaper.id, sectionId: s.a.id } });
    expect(sheet.status).toBe(200);
    expect(sheet.data.students).toHaveLength(3);
    expect((await call(getSheet, { query: { examSubjectId: s.engPaper.id, sectionId: s.a.id } })).status).toBe(403);
    expect((await call(getSheet, { query: { examSubjectId: s.mathsPaper.id, sectionId: s.b.id } })).status).toBe(403);

    const over = await call(saveMarks, { method: "PUT", body: { examSubjectId: s.mathsPaper.id, sectionId: s.a.id, marks: marks(s.students, [101, 50, 50]) } });
    expect(over.status).toBe(400);
    expect(over.error?.fields?.["marks.0.marks"]).toBe("Max 100.");
    expect((await call(saveMarks, { method: "PUT", body: { examSubjectId: s.mathsPaper.id, sectionId: s.a.id, marks: marks(s.students, [88, 35, "A"]) } })).status).toBe(200);
    expect(await db.mark.count({ where: { examSubjectId: s.mathsPaper.id } })).toBe(3);
    // Clearing a mark removes it.
    await call(saveMarks, { method: "PUT", body: { examSubjectId: s.mathsPaper.id, sectionId: s.a.id, marks: [{ studentId: s.students[1]!.id, marks: null, absent: false }] } });
    expect(await db.mark.count({ where: { examSubjectId: s.mathsPaper.id } })).toBe(2);
  });

  it("computes totals, grades and tied positions; publishing locks marks", async () => {
    const s = await school();
    await call(saveMarks, { method: "PUT", body: { examSubjectId: s.mathsPaper.id, sectionId: s.a.id, marks: marks(s.students, [90, 80, 30]) } });
    await call(saveMarks, { method: "PUT", body: { examSubjectId: s.engPaper.id, sectionId: s.a.id, marks: marks(s.students, [70, 80, null]) } });
    const computed = await call<{ pass: number; fail: number; incomplete: number }>(computeResults, { params: { id: s.examId } });
    expect(computed.data).toMatchObject({ pass: 2, fail: 0, incomplete: 1 });
    const sheet = await call<{ rows: { name: string; result: { percentage: number; position: number | null; grade: string; status: string } }[] }>(getResults, { params: { id: s.examId }, query: { sectionId: s.a.id } });
    const byName = Object.fromEntries(sheet.data.rows.map((r) => [r.name.split(" ")[0], r.result]));
    expect(byName.Ali).toMatchObject({ percentage: 80, position: 1, grade: "A", status: "PASS" });
    expect(byName.Sara).toMatchObject({ percentage: 80, position: 1 });
    expect(byName.Zain).toMatchObject({ status: "INCOMPLETE", position: null });

    const pub = await call(publish, { params: { id: s.examId }, body: { publish: true, notify: false } });
    expect(pub.status).toBe(200);
    expect((await db.exam.findUniqueOrThrow({ where: { id: s.examId } })).status).toBe("PUBLISHED");
    const locked = await call(saveMarks, { method: "PUT", body: { examSubjectId: s.engPaper.id, sectionId: s.a.id, marks: marks([s.students[2]!], [60]) } });
    expect(locked.status).toBe(400);
    expect((await call(publish, { params: { id: s.examId }, body: { publish: false } })).status).toBe(200);
    expect((await call(saveMarks, { method: "PUT", body: { examSubjectId: s.engPaper.id, sectionId: s.a.id, marks: marks([s.students[2]!], [60]) } })).status).toBe(200);
  });

  it("accountants and teachers can't compute or publish results; accountants can't enter marks", async () => {
    const s = await school();
    const accountant = await createUser({ organizationId: s.org.id, roles: s.roles }, "accountant");
    await signInAs(accountant.id);
    expect((await call(saveMarks, { method: "PUT", body: { examSubjectId: s.mathsPaper.id, sectionId: s.a.id, marks: marks(s.students, [1, 1, 1]) } })).status).toBe(403);
    expect((await call(computeResults, { params: { id: s.examId } })).status).toBe(403);
    expect((await call(publish, { params: { id: s.examId }, body: { publish: true } })).status).toBe(403);
    await signInAs(s.teacherUser.id);
    expect((await call(publish, { params: { id: s.examId }, body: { publish: true } })).status).toBe(403);
    expect((await call(createExam, { body: { name: "X", type: "QUIZ", startDate: today(), endDate: today(), classIds: [s.classId] } })).status).toBe(403);
  });

  it("keeps exams, marks and results inside their school", async () => {
    const a = await school("Alpha");
    const b = await school("Beta");
    await signInAs(b.admin.id);
    expect((await call(getExam, { params: { id: a.examId } })).status).toBe(404);
    expect((await call(getSheet, { query: { examSubjectId: a.mathsPaper.id, sectionId: a.a.id } })).status).toBe(404);
    expect((await call(saveMarks, { method: "PUT", body: { examSubjectId: a.mathsPaper.id, sectionId: a.a.id, marks: marks(a.students, [1, 1, 1]) } })).status).toBe(404);
    expect((await call(computeResults, { params: { id: a.examId } })).status).toBe(404);
    expect((await call(publish, { params: { id: a.examId }, body: { publish: true } })).status).toBe(404);
    expect((await call(getResults, { params: { id: a.examId }, query: { sectionId: a.a.id } })).status).toBe(404);
    expect(await db.mark.count({ where: { examSubjectId: a.mathsPaper.id } })).toBe(0);
  });
});
