/**
 * Security sweep: exercises EVERY API route, so a new route can't quietly skip
 * authentication, tenant scoping or permission checks.
 *
 *  1. Signed out, every non-public route returns 401.
 *  2. As another school's administrator, every route called with this school's
 *     real ids never reads its data — and afterwards a fingerprint of all of its
 *     tables (row counts + last-modified times) is unchanged, so no write slipped
 *     through whatever the status code.
 *  3. As a parent, every staff endpoint is refused.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { TENANT_MODELS } from "@/server/db/tenant";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";

type Handler = Parameters<typeof call>[0];
type RouteModule = Record<string, unknown>;

// Vite's eager glob (typed loosely here: Next's ambient types don't include it).
const modules = (import.meta as unknown as { glob: (p: string, o: { eager: true }) => Record<string, RouteModule> }).glob("../../src/app/api/**/route.ts", { eager: true });
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** "../../src/app/api/students/[id]/route.ts" → "students/[id]" */
const routePath = (file: string) => file.replace(/^.*\/src\/app\/api\//, "").replace(/\/route\.ts$/, "");
const routes = Object.entries(modules).flatMap(([file, mod]) =>
  METHODS.filter((m) => typeof mod[m] === "function").map((method) => ({ path: routePath(file), method, handler: mod[method] as Handler })),
);

/** Routes anyone may call without signing in (they authenticate some other way, or are the sign-in itself). */
const PUBLIC = new Set(["health", "auth/login", "auth/register", "auth/forgot-password", "auth/reset-password", "auth/accept-invite", "auth/logout", "files/[...key]"]);

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

let A: Awaited<ReturnType<typeof richSchool>>;
let B: Awaited<ReturnType<typeof createOrg>>;

/** School A with one of everything, so every [id] parameter can be filled with a real foreign id. */
async function richSchool() {
  const org = await createOrg("Victim");
  const o = org.org.id;
  const c = org.campus.id;
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  const today = new Date().toISOString().slice(0, 10);
  const year = await db.academicYear.create({ data: { organizationId: o, name: `Y-${Date.now()}`, startDate: d("2026-04-01"), endDate: d("2027-03-31") } });
  const dept = await db.department.create({ data: { organizationId: o, name: "Science", code: `SC${Date.now() % 100000}` } });
  const cls = await db.class.create({ data: { organizationId: o, campusId: c, name: "Grade 9", level: 9 } });
  const section = await db.section.create({ data: { organizationId: o, campusId: c, classId: cls.id, name: "A" } });
  const subject = await db.subject.create({ data: { organizationId: o, name: "Physics", code: `P${Date.now() % 100000}` } });
  const room = await db.room.create({ data: { organizationId: o, campusId: c, name: "Lab" } });
  const period = await db.period.create({ data: { organizationId: o, campusId: c, name: "P1", startMinute: 480, endMinute: 520, sortOrder: 1 } });
  const student = await db.student.create({ data: { organizationId: o, campusId: c, classId: cls.id, sectionId: section.id, admissionNo: `V-${Date.now()}`, firstName: "Victim", lastName: "Student" } });
  const guardian = await db.guardian.create({ data: { organizationId: o, firstName: "Victim", lastName: "Parent", phone: "+923000000001" } });
  await db.studentGuardian.create({ data: { organizationId: o, studentId: student.id, guardianId: guardian.id, isPrimary: true } });
  const staff = await db.staff.create({ data: { organizationId: o, campusId: c, employeeCode: `E-${Date.now()}`, firstName: "Victim", lastName: "Teacher", designation: "Teacher" } });
  const teacher = await db.teacher.create({ data: { organizationId: o, staffId: staff.id } });
  const entry = await db.timetableEntry.create({ data: { organizationId: o, campusId: c, sectionId: section.id, subjectId: subject.id, teacherId: teacher.id, periodId: period.id, dayOfWeek: 1 } });
  const user = await createUser({ organizationId: o, roles: org.roles }, "teacher");
  const role = await db.role.create({ data: { organizationId: o, key: `custom-${Date.now()}`, name: "Custom" } });
  const invitation = await db.invitation.create({ data: { organizationId: o, email: `inv-${Date.now()}@test.local`, roleId: org.roles.teacher, tokenHash: `hash-${Date.now()}`, invitedById: org.admin.id, expiresAt: new Date(Date.now() + 86_400_000) } });
  const fee = await db.feeStructure.create({ data: { organizationId: o, name: "Tuition", category: "TUITION", amount: 5000, frequency: "MONTHLY", dueDay: 10 } });
  const invoice = await db.invoice.create({ data: { organizationId: o, campusId: c, studentId: student.id, invoiceNo: `INV-V-${Date.now()}`, title: "Fees", issueDate: d(today), dueDate: d(today), subtotal: 5000, total: 5000, amountPaid: 1000, status: "PARTIAL" } });
  const payment = await db.payment.create({ data: { organizationId: o, campusId: c, invoiceId: invoice.id, studentId: student.id, receiptNo: `RCP-V-${Date.now()}`, amount: 1000, method: "CASH", paidAt: d(today) } });
  const exam = await db.exam.create({ data: { organizationId: o, name: "Victim exam", startDate: d(today), endDate: d(today) } });
  const paper = await db.examSubject.create({ data: { organizationId: o, examId: exam.id, classId: cls.id, subjectId: subject.id, maxMarks: 100, passMarks: 40 } });
  const session = await db.attendanceSession.create({ data: { organizationId: o, campusId: c, sectionId: section.id, date: d(today), slot: "DAY", presentCount: 1 } });
  const attendance = await db.attendance.create({ data: { organizationId: o, campusId: c, sessionId: session.id, sectionId: section.id, studentId: student.id, date: d(today), slot: "DAY", status: "PRESENT" } });
  const correction = await db.attendanceCorrection.create({ data: { organizationId: o, attendanceId: attendance.id, previousStatus: "PRESENT", newStatus: "ABSENT", reason: "test", requestedById: org.admin.id } });
  const leave = await db.leaveRequest.create({ data: { organizationId: o, campusId: c, requesterType: "STUDENT", studentId: student.id, type: "SICK", startDate: d(today), endDate: d(today), reason: "Fever", requestedById: org.admin.id } });
  const announcement = await db.announcement.create({ data: { organizationId: o, title: "Victim notice", body: "Secret", status: "DRAFT" } });
  const document = await db.document.create({ data: { organizationId: o, title: "Victim B-Form", fileName: "b.pdf", mimeType: "application/pdf", sizeBytes: 1, storageKey: `victim/${Date.now()}`, checksum: "x", category: "STUDENT", entityType: "student", entityId: student.id } });
  const ticket = await db.supportTicket.create({ data: { organizationId: o, number: 1, createdById: org.admin.id, subject: "Victim ticket" } });
  const sessionRow = await db.session.findFirst({ where: { user: { organizationId: o } } });
  const billingInvoice = await db.billingInvoice.findFirst({ where: { organizationId: o } });
  return { ...org, ids: { year, dept, cls, section, subject, room, period, student, guardian, staff, teacher, entry, user, role, invitation, fee, invoice, payment, exam, paper, correction, leave, announcement, document, ticket, sessionRow, billingInvoice } };
}

/** The real foreign id for each `[param]`, chosen by the path segment before it. */
function paramsFor(path: string): Record<string, string | string[]> {
  const ids = A.ids;
  const bySegment: Record<string, string> = {
    "academic-years": ids.year.id,
    departments: ids.dept.id,
    classes: ids.cls.id,
    sections: ids.section.id,
    subjects: ids.subject.id,
    rooms: ids.room.id,
    campuses: A.campus.id,
    students: ids.student.id,
    guardians: ids.guardian.id,
    staff: ids.staff.id,
    users: ids.user.id,
    roles: ids.role.id,
    invitations: ids.invitation.id,
    fees: ids.fee.id,
    invoices: ids.invoice.id,
    payments: ids.payment.id,
    exams: ids.exam.id,
    entries: ids.entry.id,
    corrections: ids.correction.id,
    leave: ids.leave.id,
    announcements: ids.announcement.id,
    documents: ids.document.id,
    support: ids.ticket.id,
    sessions: ids.sessionRow?.id ?? ids.user.id,
    organizations: A.org.id,
    plans: ids.fee.id,
  };
  const segs = path.split("/");
  const params: Record<string, string | string[]> = {};
  segs.forEach((seg, i) => {
    const m = /^\[(\.\.\.)?(\w+)\]$/.exec(seg);
    if (!m) return;
    const name = m[2]!;
    const prev = segs[i - 1] ?? "";
    params[name] =
      name === "type" ? "students" : name === "key" && prev === "reports" ? "students-roster" : name === "section" ? "attendance" : name === "guardianId" ? ids.guardian.id : (bySegment[prev] ?? ids.student.id);
  });
  return params;
}

/** Like `call`, but tolerates non-JSON responses (file downloads). */
async function hit(handler: Handler, opts: Parameters<typeof call>[1]) {
  try {
    return await call(handler, opts);
  } catch (e) {
    if (e instanceof SyntaxError) return { status: -1, success: false, data: undefined };
    throw e;
  }
}

/** Row count + last change for every tenant table, for one organization. */
async function fingerprint(organizationId: string) {
  const out: Record<string, string> = {};
  for (const model of TENANT_MODELS) {
    const delegate = (db as unknown as Record<string, { count: (a: unknown) => Promise<number>; aggregate: (a: unknown) => Promise<{ _max: Record<string, Date | null> }> }>)[model.charAt(0).toLowerCase() + model.slice(1)];
    if (!delegate) continue;
    const count = await delegate.count({ where: { organizationId } });
    let last = "";
    const fields = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[`${model}ScalarFieldEnum`];
    if (fields?.updatedAt) {
      const agg = await delegate.aggregate({ where: { organizationId }, _max: { updatedAt: true } });
      last = agg._max.updatedAt?.toISOString() ?? "";
    }
    out[model] = `${count}@${last}`;
  }
  return out;
}

beforeAll(async () => {
  A = await richSchool();
  B = await createOrg("Attacker");
});

describe("security sweep", () => {
  it(`covers a meaningful number of routes (${routes.length})`, () => {
    expect(routes.length).toBeGreaterThan(150);
  });

  it("signed out, every non-public route answers 401", async () => {
    signOut();
    const leaks: string[] = [];
    for (const r of routes) {
      if (PUBLIC.has(r.path)) continue;
      const res = await hit(r.handler, { method: r.method, params: paramsFor(r.path), body: r.method === "GET" ? undefined : {} });
      if (res.status !== 401) leaks.push(`${r.method} /api/${r.path} → ${res.status}`);
    }
    expect(leaks).toEqual([]);
  });

  it("another school's admin can't read or change anything using this school's ids", async () => {
    const before = await fingerprint(A.org.id);
    await signInAs(B.admin.id);
    const reads: string[] = [];
    const secrets = ["Victim", A.ids.invoice.invoiceNo, A.ids.payment.receiptNo];
    for (const r of routes) {
      if (!r.path.includes("[") || PUBLIC.has(r.path)) continue;
      const res = await hit(r.handler, { method: r.method, params: paramsFor(r.path), body: r.method === "GET" ? undefined : {} });
      const body = JSON.stringify(res.data ?? "");
      if (res.status >= 200 && res.status < 300 && secrets.some((s) => body.includes(s))) reads.push(`${r.method} /api/${r.path} → ${res.status} leaked data`);
      else if (r.method === "GET" && res.status === 200 && !["auth/me", "me", "imports/[type]/template", "reports/[key]", "settings/[section]"].includes(r.path)) reads.push(`${r.method} /api/${r.path} → 200`);
    }
    expect(reads).toEqual([]);
    expect(await fingerprint(A.org.id)).toEqual(before);
  });

  it("parents can't reach staff endpoints", async () => {
    const parent = await createUser({ organizationId: A.org.id, roles: A.roles }, "parent");
    await signInAs(parent.id);
    // What a parent legitimately uses.
    // `organization` GET is the school's public profile (name, address, logo) shown on their invoices.
    const allowed = new Set(["organization", "auth/me", "auth/campus", "auth/logout", "me", "me/preferences", "me/sessions/[id]", "notifications", "notifications/read", "announcements", "leave", "leave/[id]", "search"]);
    const open: string[] = [];
    for (const r of routes) {
      if (PUBLIC.has(r.path) || allowed.has(r.path) || r.path.startsWith("auth/")) continue;
      const res = await hit(r.handler, { method: r.method, params: paramsFor(r.path), body: r.method === "GET" ? undefined : {} });
      if (res.status !== 403 && res.status !== 401 && res.status !== 404) open.push(`${r.method} /api/${r.path} → ${res.status}`);
    }
    expect(open).toEqual([]);
  });
});
