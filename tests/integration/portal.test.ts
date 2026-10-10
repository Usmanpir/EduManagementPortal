import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { getTenantContext } from "@/server/auth/context";
import { familyDashboard, myAttendance, myFees, myInvoiceDocument, myReportCard, myResults, myStudents, myTimetable, resolveStudent } from "@/server/modules/portal/service";
import { staffDashboard } from "@/server/modules/dashboard/service";
import { todayIn } from "@/lib/format";
import { createOrg, createUser, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

const ctxFor = async (userId: string) => {
  await signInAs(userId);
  const ctx = await getTenantContext();
  if (!ctx) throw new Error("no context");
  return ctx;
};
const notFound = (p: Promise<unknown>) => expect(p).rejects.toMatchObject({ code: "NOT_FOUND" });

/** Two families in one school, each with data; plus an exam (published + draft) and invoices. */
async function school(name = "School") {
  const org = await createOrg(name);
  const o = org.org.id;
  const cls = await db.class.create({ data: { organizationId: o, campusId: org.campus.id, name: "Grade 3", level: 3 } });
  const section = await db.section.create({ data: { organizationId: o, campusId: org.campus.id, classId: cls.id, name: "A" } });
  const subject = await db.subject.create({ data: { organizationId: o, name: "Maths", code: `M${Date.now() % 100000}` } });
  const mkStudent = (first: string, n: number) => db.student.create({ data: { organizationId: o, campusId: org.campus.id, classId: cls.id, sectionId: section.id, admissionNo: `P-${first}-${Date.now()}-${n}`, firstName: first, lastName: "Test" } });
  const [ali, sara, omar] = [await mkStudent("Ali", 1), await mkStudent("Sara", 2), await mkStudent("Omar", 3)];

  const parentUser = await createUser({ organizationId: o, roles: org.roles }, "parent");
  const guardian = await db.guardian.create({ data: { organizationId: o, firstName: "Kamran", lastName: "Test", phone: "+923001234567", userId: parentUser.id } });
  for (const s of [ali, sara]) await db.studentGuardian.create({ data: { organizationId: o, studentId: s.id, guardianId: guardian.id, isPrimary: true } });
  const otherParent = await createUser({ organizationId: o, roles: org.roles }, "parent");
  const g2 = await db.guardian.create({ data: { organizationId: o, firstName: "Other", lastName: "Parent", phone: "+923007654321", userId: otherParent.id } });
  await db.studentGuardian.create({ data: { organizationId: o, studentId: omar.id, guardianId: g2.id, isPrimary: true } });
  const studentUser = await createUser({ organizationId: o, roles: org.roles }, "student");
  await db.student.update({ where: { id: omar.id }, data: { userId: studentUser.id } });

  const today = todayIn("Asia/Karachi");
  const mkExam = async (n: string, status: "PUBLISHED" | "SCHEDULED") => {
    const exam = await db.exam.create({ data: { organizationId: o, name: n, startDate: new Date(`${today}T00:00:00Z`), endDate: new Date(`${today}T00:00:00Z`), status, publishedAt: status === "PUBLISHED" ? new Date() : null } });
    const paper = await db.examSubject.create({ data: { organizationId: o, examId: exam.id, classId: cls.id, subjectId: subject.id, maxMarks: 100, passMarks: 40 } });
    for (const s of [ali, sara, omar]) {
      await db.mark.create({ data: { organizationId: o, examSubjectId: paper.id, studentId: s.id, marksObtained: 70 } });
      await db.result.create({ data: { organizationId: o, examId: exam.id, studentId: s.id, totalObtained: 70, totalMax: 100, percentage: 70, grade: "B", status: "PASS", position: 1, publishedAt: status === "PUBLISHED" ? new Date() : null } });
    }
    return exam;
  };
  const published = await mkExam("Published test", "PUBLISHED");
  const draft = await mkExam("Unpublished test", "SCHEDULED");
  const mkInvoice = (studentId: string, no: string) =>
    db.invoice.create({ data: { organizationId: o, campusId: org.campus.id, studentId, invoiceNo: `${no}-${Date.now()}`, title: "Fees", issueDate: new Date(`${today}T00:00:00Z`), dueDate: new Date(`${today}T00:00:00Z`), subtotal: 5000, total: 5000 } });
  const aliInvoice = await mkInvoice(ali.id, "INV-A");
  const omarInvoice = await mkInvoice(omar.id, "INV-O");
  return { ...org, ali, sara, omar, parentUser, otherParent, studentUser, published, draft, aliInvoice, omarInvoice, today };
}

describe("family portal", () => {
  it("a parent sees exactly their own children, and URL tampering can't select another", async () => {
    const s = await school();
    const ctx = await ctxFor(s.parentUser.id);
    expect((await myStudents(ctx)).map((x) => x.firstName).sort()).toEqual(["Ali", "Sara"]);
    const picked = await resolveStudent(ctx, s.omar.id);
    expect(picked.student?.id).not.toBe(s.omar.id);
    expect([s.ali.id, s.sara.id]).toContain(picked.student?.id);
    expect((await familyDashboard(ctx)).map((c) => c.id).sort()).toEqual([s.ali.id, s.sara.id].sort());
  });

  it("every portal read refuses someone else's child", async () => {
    const s = await school();
    const ctx = await ctxFor(s.parentUser.id);
    await notFound(myAttendance(ctx, s.omar.id, s.today.slice(0, 7)));
    await notFound(myFees(ctx, s.omar.id));
    await notFound(myResults(ctx, s.omar.id));
    await notFound(myTimetable(ctx, s.omar.id));
    await notFound(myReportCard(ctx, s.omar.id, s.published.id));
    await notFound(myInvoiceDocument(ctx, s.omarInvoice.id));
    // Their own child works.
    expect((await myFees(ctx, s.ali.id)).balance).toBe(5000);
    expect((await myInvoiceDocument(ctx, s.aliInvoice.id))?.invoiceNo).toMatch(/^INV-A/);
  });

  it("families only ever see published results", async () => {
    const s = await school();
    const ctx = await ctxFor(s.parentUser.id);
    const results = await myResults(ctx, s.ali.id);
    expect(results.map((r) => r.exam)).toEqual(["Published test"]);
    expect((await myReportCard(ctx, s.ali.id, s.published.id)).result?.percentage).toBe(70);
    await notFound(myReportCard(ctx, s.ali.id, s.draft.id));
  });

  it("a student sees only themselves", async () => {
    const s = await school();
    const ctx = await ctxFor(s.studentUser.id);
    expect((await myStudents(ctx)).map((x) => x.id)).toEqual([s.omar.id]);
    await notFound(myFees(ctx, s.ali.id));
    expect((await myFees(ctx, s.omar.id)).invoices).toHaveLength(1);
  });

  it("a parent in another school can't reach these children", async () => {
    const a = await school("Alpha");
    const b = await school("Beta");
    const ctx = await ctxFor(b.parentUser.id);
    expect((await resolveStudent(ctx, a.ali.id)).student?.id).not.toBe(a.ali.id);
    await notFound(myFees(ctx, a.ali.id));
    await notFound(myReportCard(ctx, a.ali.id, a.published.id));
    await notFound(myInvoiceDocument(ctx, a.aliInvoice.id));
  });
});

describe("staff dashboard", () => {
  it("shows each block only to roles allowed to see it", async () => {
    const s = await school();
    const accountant = await createUser({ organizationId: s.org.id, roles: s.roles }, "accountant");
    const acc = await staffDashboard(await ctxFor(accountant.id));
    expect(acc.finance).not.toBeNull();
    expect(acc.pendingLeave).toBeNull();
    expect(acc.lessons).toBeNull();

    const teacher = await createUser({ organizationId: s.org.id, roles: s.roles }, "teacher");
    const t = await staffDashboard(await ctxFor(teacher.id));
    expect(t.finance).toBeNull();
    expect(t.counts).toBeNull();

    const admin = await staffDashboard(await ctxFor(s.admin.id));
    expect(admin.finance?.outstanding).toBe(10000);
    expect(admin.counts?.students).toBe(3);
  });
});
