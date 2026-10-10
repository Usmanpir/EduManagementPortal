import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { POST as createClass } from "@/app/api/classes/route";
import { POST as createFee } from "@/app/api/fees/route";
import { PATCH as updateFee } from "@/app/api/fees/[id]/route";
import { PUT as setStudentFee } from "@/app/api/students/[id]/fees/route";
import { POST as generate } from "@/app/api/invoices/generate/route";
import { GET as listInvoices, POST as createInvoice } from "@/app/api/invoices/route";
import { DELETE as cancelInvoice, GET as getInvoice } from "@/app/api/invoices/[id]/route";
import { POST as recordPayment } from "@/app/api/payments/route";
import { DELETE as voidPayment } from "@/app/api/payments/[id]/route";
import { GET as financeReport } from "@/app/api/finance/report/route";
import { todayIn } from "@/lib/format";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

const today = () => todayIn("Asia/Karachi");
const period = () => today().slice(0, 7);

/** An org with one class, three students (one with a van opt-in & sibling discount) and tuition + van fees. */
async function school(name = "School") {
  const org = await createOrg(name);
  await signInAs(org.admin.id);
  const cls = await call<{ id: string }>(createClass, { body: { name: "Grade 4", level: 4, campusId: org.campus.id, sections: ["A"] } });
  const section = await db.section.findFirstOrThrow({ where: { classId: cls.data.id } });
  const mk = (first: string, n: number) =>
    db.student.create({ data: { organizationId: org.org.id, campusId: org.campus.id, classId: cls.data.id, sectionId: section.id, admissionNo: `F-${first}-${Date.now()}-${n}`, firstName: first, lastName: "Test" } });
  const students = [await mk("Ali", 1), await mk("Sara", 2), await mk("Zain", 3)];
  const tuition = await call<{ id: string }>(createFee, { body: { name: "Tuition", category: "TUITION", amount: 5000, frequency: "MONTHLY", dueDay: 10, classId: cls.data.id } });
  const van = await call<{ id: string }>(createFee, { body: { name: "Van", category: "TRANSPORT", amount: 3000, frequency: "MONTHLY", dueDay: 10 } });
  expect(tuition.status).toBe(201);
  return { ...org, classId: cls.data.id, students, tuitionId: tuition.data.id, vanId: van.data.id };
}

async function generateMonth(s: Awaited<ReturnType<typeof school>>) {
  return call<{ created: number; skipped: number }>(generate, { body: { billingPeriod: period(), issueDate: today(), dueDate: today(), feeStructureIds: [s.tuitionId, s.vanId] } });
}

describe("fees & invoices", () => {
  it("generates monthly invoices with opt-ins and discounts, and is safe to run twice", async () => {
    const s = await school();
    const [ali] = s.students;
    expect((await call(setStudentFee, { method: "PUT", params: { id: ali!.id }, body: { feeStructureId: s.vanId, isActive: true, discountType: "NONE", discountValue: 0 } })).status).toBe(200);
    expect((await call(setStudentFee, { method: "PUT", params: { id: ali!.id }, body: { feeStructureId: s.tuitionId, isActive: true, discountType: "PERCENT", discountValue: 10, discountReason: "Sibling" } })).status).toBe(200);

    const first = await generateMonth(s);
    expect(first.data).toMatchObject({ created: 3, skipped: 0 });
    const again = await generateMonth(s);
    expect(again.data).toMatchObject({ created: 0, skipped: 3 });

    const aliInvoice = await db.invoice.findFirstOrThrow({ where: { studentId: ali!.id }, include: { items: true } });
    // 5000 tuition − 10% + 3000 van (opted in)
    expect(Number(aliInvoice.total)).toBe(7500);
    expect(aliInvoice.items).toHaveLength(2);
    const sara = await db.invoice.findFirstOrThrow({ where: { studentId: s.students[1]!.id } });
    expect(Number(sara.total)).toBe(5000); // van is opt-in only
  });

  it("rejects discounts larger than the fee", async () => {
    const s = await school();
    const res = await call(setStudentFee, { method: "PUT", params: { id: s.students[0]!.id }, body: { feeStructureId: s.tuitionId, isActive: true, discountType: "FIXED", discountValue: 6000 } });
    expect(res.status).toBe(400);
    expect(res.error?.fields?.discountValue).toBeTruthy();
  });

  it("only finance roles can change fees; teachers can't see invoices", async () => {
    const s = await school();
    const teacher = await createUser({ organizationId: s.org.id, roles: s.roles }, "teacher");
    await signInAs(teacher.id);
    expect((await call(updateFee, { method: "PATCH", params: { id: s.tuitionId }, body: { name: "Tuition", category: "TUITION", amount: 1, frequency: "MONTHLY", dueDay: 10 } })).status).toBe(403);
    expect((await call(createFee, { body: { name: "X", category: "OTHER", amount: 10, frequency: "ONE_TIME", dueDay: 1 } })).status).toBe(403);
    expect((await call(listInvoices)).status).toBe(403);

    const accountant = await createUser({ organizationId: s.org.id, roles: s.roles }, "accountant");
    await signInAs(accountant.id);
    expect((await call(updateFee, { method: "PATCH", params: { id: s.tuitionId }, body: { name: "Tuition", category: "TUITION", amount: 5200, frequency: "MONTHLY", dueDay: 10, classId: s.classId } })).status).toBe(200);
  });
});

describe("payments", () => {
  it("records partial and full payments, rejects overpayment, and is idempotent", async () => {
    const s = await school();
    const inv = await call<{ id: string }>(createInvoice, { body: { studentId: s.students[0]!.id, title: "Admission", issueDate: today(), dueDate: today(), items: [{ description: "Admission fee", category: "ADMISSION", amount: 10000, discount: 0 }] } });
    expect(inv.status).toBe(201);
    const base = { invoiceId: inv.data.id, method: "CASH", paidAt: today() };

    const over = await call(recordPayment, { body: { ...base, amount: 12000, idempotencyKey: "key-over-123" } });
    expect(over.status).toBe(400);
    expect(over.error?.fields?.amount).toMatch(/more than the balance/);

    const p1 = await call<{ id: string; receiptNo: string; duplicate: boolean }>(recordPayment, { body: { ...base, amount: 4000, idempotencyKey: "key-part-123" } });
    expect(p1.status).toBe(201);
    const retry = await call<{ id: string; duplicate: boolean }>(recordPayment, { body: { ...base, amount: 4000, idempotencyKey: "key-part-123" } });
    expect(retry.data.id).toBe(p1.data.id);
    expect(retry.data.duplicate).toBe(true);
    expect(await db.payment.count({ where: { invoiceId: inv.data.id } })).toBe(1);
    expect((await db.invoice.findUniqueOrThrow({ where: { id: inv.data.id } })).status).toBe("PARTIAL");

    const p2 = await call<{ id: string }>(recordPayment, { body: { ...base, amount: 6000, idempotencyKey: "key-rest-123" } });
    expect(p2.status).toBe(201);
    const doc = await call<{ status: string; balance: number }>(getInvoice, { params: { id: inv.data.id } });
    expect(doc.data).toMatchObject({ status: "PAID", balance: 0 });

    // Paid invoices can't be cancelled until payments are voided.
    expect((await call(cancelInvoice, { method: "DELETE", params: { id: inv.data.id }, body: { reason: "Mistake" } })).status).toBe(400);
    expect((await call(voidPayment, { method: "DELETE", params: { id: p2.data.id }, body: { reason: "Cheque bounced" } })).status).toBe(200);
    const after = await db.invoice.findUniqueOrThrow({ where: { id: inv.data.id } });
    expect(after.status).toBe("PARTIAL");
    expect(Number(after.amountPaid)).toBe(4000);
  });

  it("concurrent payments can't overpay an invoice", async () => {
    const s = await school();
    const inv = await call<{ id: string }>(createInvoice, { body: { studentId: s.students[1]!.id, title: "Books", issueDate: today(), dueDate: today(), items: [{ description: "Books", category: "OTHER", amount: 5000, discount: 0 }] } });
    const results = await Promise.all(
      ["a", "b", "c"].map((k) => call(recordPayment, { body: { invoiceId: inv.data.id, amount: 3000, method: "CASH", paidAt: today(), idempotencyKey: `race-${k}-${inv.data.id}` } })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    const invoice = await db.invoice.findUniqueOrThrow({ where: { id: inv.data.id } });
    expect(Number(invoice.amountPaid)).toBe(3000);
  });

  it("doesn't let one school see or pay another school's invoices", async () => {
    const a = await school("Alpha");
    await generateMonth(a);
    const aInvoice = await db.invoice.findFirstOrThrow({ where: { organizationId: a.org.id } });
    const b = await school("Beta");
    await signInAs(b.admin.id);
    expect((await call(getInvoice, { params: { id: aInvoice.id } })).status).toBe(404);
    expect((await call(recordPayment, { body: { invoiceId: aInvoice.id, amount: 100, method: "CASH", paidAt: today(), idempotencyKey: `x-tenant-${aInvoice.id}` } })).status).toBe(404);
    expect((await call(cancelInvoice, { method: "DELETE", params: { id: aInvoice.id }, body: { reason: "Hostile" } })).status).toBe(404);
    expect((await call(setStudentFee, { method: "PUT", params: { id: a.students[0]!.id }, body: { feeStructureId: a.tuitionId, isActive: false, discountType: "NONE", discountValue: 0 } })).status).toBe(404);
    const list = await call<{ total: number }>(listInvoices);
    expect(list.data.total).toBe(0);
    const report = await call<{ totals: { outstanding: number } }>(financeReport, { query: { from: `${period()}-01`, to: today() } });
    expect(report.data.totals.outstanding).toBe(0);
  });
});
