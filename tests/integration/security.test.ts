import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as createInvoice } from "@/app/api/invoices/route";
import { POST as recordPayment } from "@/app/api/payments/route";
import { POST as createSection } from "@/app/api/sections/route";
import { PUT as saveMarks } from "@/app/api/marks/route";
import { PUT as setEntry } from "@/app/api/timetable/entries/route";
import { POST as createLeave } from "@/app/api/leave/route";
import { PUT as saveSchedule } from "@/app/api/exams/[id]/schedule/route";
import { POST as createRoom } from "@/app/api/rooms/route";
import { PATCH as updateSubject } from "@/app/api/subjects/[id]/route";
import { GET as files } from "@/app/api/files/[...key]/route";
import { testPasswordHash } from "../support/fixtures";
import { testCookieOptions, testCookies } from "../support/integration-env";
import { call, createOrg, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

const today = () => new Date().toISOString().slice(0, 10);
const d = (s: string) => new Date(`${s}T00:00:00Z`);

async function school(name: string) {
  const org = await createOrg(name);
  const o = org.org.id;
  const c = org.campus.id;
  const cls = await db.class.create({ data: { organizationId: o, campusId: c, name: "Grade 6", level: 6 } });
  const section = await db.section.create({ data: { organizationId: o, campusId: c, classId: cls.id, name: "A" } });
  const subject = await db.subject.create({ data: { organizationId: o, name: "Maths", code: `M${Math.floor(Math.random() * 1e6)}` } });
  const period = await db.period.create({ data: { organizationId: o, campusId: c, name: "P1", startMinute: 480, endMinute: 520, sortOrder: 1 } });
  const student = await db.student.create({ data: { organizationId: o, campusId: c, classId: cls.id, sectionId: section.id, admissionNo: `S-${Date.now()}-${Math.random()}`, firstName: name, lastName: "Student" } });
  const invoice = await db.invoice.create({ data: { organizationId: o, campusId: c, studentId: student.id, invoiceNo: `I-${Date.now()}-${Math.random()}`, title: "Fees", issueDate: d(today()), dueDate: d(today()), subtotal: 1000, total: 1000 } });
  const exam = await db.exam.create({ data: { organizationId: o, name: "Exam", startDate: d(today()), endDate: d(today()) } });
  const paper = await db.examSubject.create({ data: { organizationId: o, examId: exam.id, classId: cls.id, subjectId: subject.id, maxMarks: 100, passMarks: 40 } });
  return { ...org, cls, section, subject, period, student, invoice, exam, paper };
}

describe("planting another school's ids", () => {
  it("can't create records in your school that point at another school's data", async () => {
    const a = await school("Alpha");
    const b = await school("Beta");
    await signInAs(b.admin.id);
    const attempts = [
      ["invoice for their student", await call(createInvoice, { body: { studentId: a.student.id, title: "x", issueDate: today(), dueDate: today(), items: [{ description: "x", category: "OTHER", amount: 10, discount: 0 }] } })],
      ["payment on their invoice", await call(recordPayment, { body: { invoiceId: a.invoice.id, amount: 10, method: "CASH", paidAt: today(), idempotencyKey: `x-${Date.now()}` } })],
      ["section in their class", await call(createSection, { body: { classId: a.cls.id, name: "Z" } })],
      ["marks on their paper", await call(saveMarks, { method: "PUT", body: { examSubjectId: a.paper.id, sectionId: a.section.id, marks: [{ studentId: a.student.id, marks: 1, absent: false }] } })],
      ["marks for their student on our paper", await call(saveMarks, { method: "PUT", body: { examSubjectId: b.paper.id, sectionId: b.section.id, marks: [{ studentId: a.student.id, marks: 1, absent: false }] } })],
      ["lesson in their section", await call(setEntry, { method: "PUT", body: { sectionId: a.section.id, dayOfWeek: 1, periodId: b.period.id, subjectId: b.subject.id } })],
      ["lesson with their period", await call(setEntry, { method: "PUT", body: { sectionId: b.section.id, dayOfWeek: 1, periodId: a.period.id, subjectId: b.subject.id } })],
      ["leave for their student", await call(createLeave, { body: { requesterType: "STUDENT", studentId: a.student.id, type: "SICK", startDate: today(), endDate: today(), reason: "Fever today" } })],
      ["their class on our date sheet", await call(saveSchedule, { method: "PUT", params: { id: b.exam.id }, body: { classId: a.cls.id, subjects: [{ subjectId: b.subject.id, maxMarks: 100, passMarks: 40 }] } })],
    ] as const;
    const accepted = attempts.filter(([, r]) => r.status < 400).map(([what, r]) => `${what} → ${r.status}`);
    expect(accepted).toEqual([]);
    expect(attempts.every(([, r]) => [400, 403, 404, 422].includes(r.status))).toBe(true);
    // Nothing landed anywhere.
    expect(await db.invoice.count({ where: { studentId: a.student.id } })).toBe(1);
    expect(await db.payment.count({ where: { invoiceId: a.invoice.id } })).toBe(0);
    expect(await db.section.count({ where: { classId: a.cls.id } })).toBe(1);
    expect(await db.mark.count({ where: { studentId: a.student.id } })).toBe(0);
    expect(await db.timetableEntry.count({ where: { OR: [{ sectionId: a.section.id }, { periodId: a.period.id }] } })).toBe(0);
    expect(await db.leaveRequest.count({ where: { studentId: a.student.id } })).toBe(0);
    expect(await db.examSubject.count({ where: { examId: b.exam.id, classId: a.cls.id } })).toBe(0);
  });

  it("ignores attempts to set organizationId or ids in the request body", async () => {
    const a = await school("Gamma");
    const b = await school("Delta");
    await signInAs(b.admin.id);
    const room = await call<{ id: string }>(createRoom, { body: { campusId: b.campus.id, name: "Smuggled", type: "CLASSROOM", organizationId: a.org.id } });
    expect(room.status).toBe(201);
    expect((await db.room.findUniqueOrThrow({ where: { id: room.data.id } })).organizationId).toBe(b.org.id);
    await call(updateSubject, { method: "PATCH", params: { id: b.subject.id }, body: { name: "Renamed", code: b.subject.code, type: "CORE", organizationId: a.org.id, id: a.subject.id } });
    expect((await db.subject.findUniqueOrThrow({ where: { id: b.subject.id } })).organizationId).toBe(b.org.id);
    expect((await db.subject.findUniqueOrThrow({ where: { id: a.subject.id } })).name).toBe("Maths");
  });
});

describe("sessions & files", () => {
  it("issues an HttpOnly, SameSite session cookie, and none on a failed sign-in", async () => {
    const email = `cookie-${Date.now()}@test.local`;
    await db.user.create({ data: { email, passwordHash: await testPasswordHash(), firstName: "Cookie", lastName: "Test", isSuperAdmin: true } });
    testCookies.clear();
    testCookieOptions.clear();
    expect((await call(login, { body: { email, password: "wrong-password-1" } })).status).toBe(401);
    expect(testCookies.size).toBe(0);
    expect((await call(login, { body: { email, password: "Password123!" } })).status).toBe(200);
    const [name, opts] = [...testCookieOptions.entries()][0]!;
    expect(name).toMatch(/ea_session/);
    expect(opts).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/" });
    // `secure` follows NODE_ENV; production also uses the __Host- prefix.
    expect(opts.secure).toBe(process.env.NODE_ENV === "production");
  });

  it("serves private files only with a valid signature", async () => {
    const res = await files(new NextRequest("http://localhost:3000/api/files/org/x/doc.pdf?exp=9999999999&sig=forged"), { params: Promise.resolve({ key: ["org", "x", "doc.pdf"] }) });
    expect(res.status).toBe(403);
    const traversal = await files(new NextRequest("http://localhost:3000/api/files/../../.env"), { params: Promise.resolve({ key: ["..", "..", ".env"] }) });
    expect(traversal.status).toBe(404);
  });
});
