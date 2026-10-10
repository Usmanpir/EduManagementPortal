import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { GET as report } from "@/app/api/reports/[key]/route";
import { SESSION_COOKIE } from "@/server/auth/session";
import { REPORTS } from "@/lib/reports";
import { todayIn } from "@/lib/format";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

const today = () => todayIn("Asia/Karachi");
const d = (s: string) => new Date(`${s}T00:00:00Z`);

/** A small school with attendance, a payment, an invoice and an exam with results. */
async function school(name = "School") {
  const org = await createOrg(name);
  const o = org.org.id;
  const c = org.campus.id;
  const cls = await db.class.create({ data: { organizationId: o, campusId: c, name: "Grade 4", level: 4 } });
  const section = await db.section.create({ data: { organizationId: o, campusId: c, classId: cls.id, name: "A", capacity: 30 } });
  const mk = (first: string, gender: "MALE" | "FEMALE", n: number) => db.student.create({ data: { organizationId: o, campusId: c, classId: cls.id, sectionId: section.id, admissionNo: `R-${first}-${Date.now()}-${n}`, rollNumber: String(n), rollOrder: n, firstName: first, lastName: "Test", gender } });
  const ali = await mk("Ali", "MALE", 1);
  const sara = await mk("Sara", "FEMALE", 2);

  const t = today();
  const session = await db.attendanceSession.create({ data: { organizationId: o, campusId: c, sectionId: section.id, date: d(t), slot: "DAY", presentCount: 1, absentCount: 1 } });
  await db.attendance.createMany({
    data: [
      { organizationId: o, campusId: c, sessionId: session.id, sectionId: section.id, studentId: ali.id, date: d(t), slot: "DAY", status: "PRESENT" },
      { organizationId: o, campusId: c, sessionId: session.id, sectionId: section.id, studentId: sara.id, date: d(t), slot: "DAY", status: "ABSENT" },
    ],
  });
  const invoice = await db.invoice.create({ data: { organizationId: o, campusId: c, studentId: sara.id, invoiceNo: `INV-${Date.now()}`, title: "Fees", issueDate: d(t), dueDate: d(t), subtotal: 5000, total: 5000, amountPaid: 2000, status: "PARTIAL" } });
  await db.payment.create({ data: { organizationId: o, campusId: c, invoiceId: invoice.id, studentId: sara.id, receiptNo: `RCP-${Date.now()}`, amount: 2000, method: "CASH", paidAt: d(t) } });

  const subject = await db.subject.create({ data: { organizationId: o, name: "Maths", code: `M${Date.now() % 100000}` } });
  const exam = await db.exam.create({ data: { organizationId: o, name: "Test", startDate: d(t), endDate: d(t), status: "PUBLISHED", publishedAt: new Date() } });
  const paper = await db.examSubject.create({ data: { organizationId: o, examId: exam.id, classId: cls.id, subjectId: subject.id, maxMarks: 50, passMarks: 20 } });
  await db.mark.createMany({ data: [{ organizationId: o, examSubjectId: paper.id, studentId: ali.id, marksObtained: 45 }, { organizationId: o, examSubjectId: paper.id, studentId: sara.id, marksObtained: 15 }] });
  await db.result.createMany({
    data: [
      { organizationId: o, examId: exam.id, studentId: ali.id, totalObtained: 45, totalMax: 50, percentage: 90, grade: "A+", status: "PASS", position: 1, publishedAt: new Date() },
      { organizationId: o, examId: exam.id, studentId: sara.id, totalObtained: 15, totalMax: 50, percentage: 30, grade: "F", status: "FAIL", position: 2, publishedAt: new Date() },
    ],
  });
  return { ...org, cls, section, ali, sara, exam };
}

type Result = { columns: { key: string; label: string }[]; rows: Record<string, unknown>[]; summary?: { label: string; value: unknown }[] };
const run = (key: string, query: Record<string, string> = {}) => call<Result>(report, { params: { key }, query });

describe("reports", () => {
  it("every report in the catalog runs for an administrator", async () => {
    const s = await school();
    await signInAs(s.admin.id);
    for (const r of REPORTS) {
      const q: Record<string, string> = {};
      if (r.required?.includes("section")) q.sectionId = s.section.id;
      if (r.required?.includes("exam")) q.examId = s.exam.id;
      const res = await run(r.key, q);
      expect(res.status, r.key).toBe(200);
      expect(res.data.columns.length, r.key).toBeGreaterThan(0);
    }
  });

  it("computes the right numbers", async () => {
    const s = await school();
    await signInAs(s.admin.id);
    const register = await run("attendance-register", { sectionId: s.section.id });
    const ali = register.data.rows.find((r) => r.student === "Ali Test")!;
    expect(ali[today()]).toBe("P");
    expect(register.data.rows.find((r) => r.student === "Sara Test")![today()]).toBe("A");

    const subjects = await run("exam-subjects", { examId: s.exam.id });
    expect(subjects.data.rows[0]).toMatchObject({ subject: "Maths", sat: 2, highest: 45, lowest: 15, passRate: 50, average: 60 });

    const collections = await run("fee-collections");
    expect(collections.data.summary?.[0]).toMatchObject({ label: "Total received", value: 2000 });
    const outstanding = await run("fee-outstanding");
    expect(outstanding.data.rows).toHaveLength(1);
    expect(outstanding.data.rows[0]).toMatchObject({ student: "Sara Test", balance: 3000 });

    const enrollment = await run("enrollment");
    expect(enrollment.data.rows[0]).toMatchObject({ boys: 1, girls: 1, total: 2, capacity: 30 });
  });

  it("asks for required filters instead of guessing", async () => {
    const s = await school();
    await signInAs(s.admin.id);
    expect((await run("attendance-register")).status).toBe(400);
    expect((await run("exam-toppers")).status).toBe(400);
    expect((await run("no-such-report")).status).toBe(404);
  });

  it("checks both reports.view and each report's own permission", async () => {
    const s = await school();
    const teacher = await createUser({ organizationId: s.org.id, roles: s.roles }, "teacher");
    await signInAs(teacher.id);
    expect((await run("enrollment")).status).toBe(403);

    const accountant = await createUser({ organizationId: s.org.id, roles: s.roles }, "accountant");
    await signInAs(accountant.id);
    expect((await run("fee-collections")).status).toBe(200);
    expect((await run("attendance-students")).status).toBe(403);
    expect((await run("exam-subjects", { examId: s.exam.id })).status).toBe(403);
  });

  it("exports CSV with labelled columns and audits it", async () => {
    const s = await school();
    const token = await signInAs(s.admin.id);
    const url = new URL("http://localhost:3000/api/reports/fee-outstanding?format=csv");
    const res = await report(new NextRequest(url, { headers: { origin: "http://localhost:3000", cookie: `${SESSION_COOKIE}=${token}` } }), { params: Promise.resolve({ key: "fee-outstanding" }) });
    expect(res.headers.get("content-type")).toMatch(/text\/csv/);
    const text = await res.text();
    expect(text).toContain("Student,Admission no.,Class");
    expect(text).toContain("Sara Test");
    expect(await db.auditLog.count({ where: { organizationId: s.org.id, action: "report.export" } })).toBe(1);
  });

  it("never reports on another school's data", async () => {
    const a = await school("Alpha");
    const b = await school("Beta");
    await signInAs(b.admin.id);
    expect((await run("attendance-register", { sectionId: a.section.id })).status).toBe(404);
    expect((await run("exam-subjects", { examId: a.exam.id })).status).toBe(404);
    expect((await run("exam-toppers", { examId: a.exam.id })).status).toBe(404);
    const students = await run("students-roster", { classId: a.cls.id });
    expect(students.data.rows).toHaveLength(0);
    const collections = await run("fee-collections");
    expect(collections.data.rows.every((r) => !String(r.student).includes("Alpha"))).toBe(true);
    expect(collections.data.rows).toHaveLength(1);
  });
});
