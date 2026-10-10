import { beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/server/db/client";
import { hashToken } from "@/server/auth/crypto";
import { GET as listStudents, POST as createStudent } from "@/app/api/students/route";
import { GET as getStudent, PATCH as updateStudent, DELETE as archiveStudent } from "@/app/api/students/[id]/route";
import { POST as restoreStudent } from "@/app/api/students/[id]/restore/route";
import { GET as exportStudents } from "@/app/api/students/export/route";
import { POST as previewImport } from "@/app/api/imports/[type]/preview/route";
import { POST as commitImport } from "@/app/api/imports/[type]/commit/route";
import { POST as uploadDocument } from "@/app/api/documents/route";
import { DELETE as deleteDocument } from "@/app/api/documents/[id]/route";
import { POST as createStaff } from "@/app/api/staff/route";
import { POST as acceptInvite } from "@/app/api/auth/accept-invite/route";
import { POST as createClass } from "@/app/api/classes/route";
import { testCookies } from "../support/integration-env";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

async function school(name = "School") {
  const org = await createOrg(name);
  await signInAs(org.admin.id);
  const cls = await call<{ id: string }>(createClass, { body: { name: "Grade 8", level: 8, campusId: org.campus.id, sections: ["A", "B"] } });
  const sections = await db.section.findMany({ where: { classId: cls.data.id }, orderBy: { name: "asc" } });
  return { ...org, classId: cls.data.id, sectionA: sections[0]!.id, sectionB: sections[1]!.id };
}

const guardian = (overrides: Record<string, unknown> = {}) => ({
  firstName: "Kamran",
  lastName: "Raza",
  relation: "FATHER",
  phone: "+92 300 1234567",
  email: "",
  cnic: "",
  ...overrides,
});

function studentBody(s: { campus: { id: string }; sectionA: string }, overrides: Record<string, unknown> = {}) {
  return { firstName: "Ayesha", lastName: "Raza", campusId: s.campus.id, sectionId: s.sectionA, rollNumber: "1", guardians: [guardian()], ...overrides };
}

async function multipart(handler: typeof previewImport, path: string, params: Record<string, string>, file: File, extra: Record<string, string> = {}) {
  const form = new FormData();
  form.set("file", file);
  for (const [k, v] of Object.entries(extra)) form.set(k, v);
  const headers = new Headers({ origin: "http://localhost:3000", cookie: `ea_session=${testCookies.get("ea_session")}` });
  const res = await handler(new NextRequest(new URL(path, "http://localhost:3000"), { method: "POST", headers, body: form }), { params: Promise.resolve(params) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test helper; each call site knows its shape
  return { status: res.status, ...((await res.json()) as { data: any; error?: { message: string } }) };
}

describe("students", () => {
  it("creates a student with an auto admission number and shares a guardian between siblings", async () => {
    const s = await school();
    const first = await call<{ id: string; admissionNo: string }>(createStudent, { body: studentBody(s) });
    expect(first.status).toBe(201);
    expect(first.data.admissionNo).toMatch(/^STU-\d{4}$/);

    const sibling = await call<{ id: string }>(createStudent, { body: studentBody(s, { firstName: "Bilal", rollNumber: "2" }) });
    expect(sibling.status).toBe(201);
    const links = await db.studentGuardian.findMany({ where: { studentId: { in: [first.data.id, sibling.data.id] } } });
    expect(new Set(links.map((l) => l.guardianId)).size).toBe(1);

    const profile = await call<{ student: { guardians: { isPrimary: boolean }[] } }>(getStudent, { params: { id: first.data.id } });
    expect(profile.data.student.guardians[0]!.isPrimary).toBe(true);
  });

  it("explains roll-number clashes on the field", async () => {
    const s = await school();
    await call(createStudent, { body: studentBody(s) });
    const clash = await call(createStudent, { body: studentBody(s, { firstName: "Zara" }) });
    expect(clash.status).toBe(409);
    expect(clash.error?.fields?.rollNumber).toMatch(/already used by Ayesha Raza/);
  });

  it("archives, hides and restores a student", async () => {
    const s = await school();
    const st = await call<{ id: string }>(createStudent, { body: studentBody(s) });
    expect((await call(archiveStudent, { method: "DELETE", params: { id: st.data.id }, body: { reason: "Left school" } })).status).toBe(200);
    const active = await call<{ total: number }>(listStudents);
    expect(active.data.total).toBe(0);
    const archived = await call<{ total: number }>(listStudents, { query: { status: "ARCHIVED" } });
    expect(archived.data.total).toBe(1);
    expect((await call(restoreStudent, { method: "POST", params: { id: st.data.id } })).status).toBe(200);
    expect((await call<{ total: number }>(listStudents)).data.total).toBe(1);
  });

  it("finds students by full name in either order", async () => {
    const s = await school();
    await call(createStudent, { body: studentBody(s) });
    await call(createStudent, { body: studentBody(s, { firstName: "Bilal", rollNumber: "2" }) });
    for (const q of ["Ayesha Raza", "raza ayesha", "Ayes"]) {
      const res = await call<{ total: number }>(listStudents, { query: { q } });
      expect(res.data.total, q).toBe(1);
    }
    expect((await call<{ total: number }>(listStudents, { query: { q: "Raza" } })).data.total).toBe(2);
    expect((await call<{ total: number }>(listStudents, { query: { q: "Ayesha Khan" } })).data.total).toBe(0);
  });

  it("enforces the student limit of the plan", async () => {
    const s = await school();
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: s.org.id } });
    await db.subscription.update({ where: { id: sub.id }, data: { customLimits: { students: 1 } } });
    expect((await call(createStudent, { body: studentBody(s) })).status).toBe(201);
    const over = await call(createStudent, { body: studentBody(s, { firstName: "Second", rollNumber: "2" }) });
    expect(over.status).toBe(402);
  });

  it("neutralizes spreadsheet formulas in exports", async () => {
    const s = await school();
    await call(createStudent, { body: studentBody(s, { firstName: "=HYPERLINK(\"http://evil\")", lastName: "+cmd" }) });
    const res = await exportStudents(
      new NextRequest(new URL("/api/students/export?format=csv", "http://localhost:3000"), { headers: { cookie: `ea_session=${testCookies.get("ea_session")}` } }),
      { params: Promise.resolve({}) },
    );
    const text = await res.text();
    expect(text).toContain(`"'=HYPERLINK(""http://evil"")"`);
    expect(text).toContain("'+cmd");
  });
});

describe("student data access", () => {
  it("teachers only see and edit students in their own sections", async () => {
    const s = await school();
    const mine = await call<{ id: string }>(createStudent, { body: studentBody(s) });
    const other = await call<{ id: string }>(createStudent, { body: studentBody(s, { firstName: "Other", sectionId: s.sectionB }) });

    const user = await createUser({ organizationId: s.org.id, roles: s.roles }, "teacher");
    const staff = await db.staff.create({ data: { organizationId: s.org.id, campusId: s.campus.id, userId: user.id, employeeCode: `T${Date.now()}`, firstName: "Sara", lastName: "M", designation: "Teacher" } });
    await db.section.update({ where: { id: s.sectionA }, data: { classTeacherId: staff.id } });
    await signInAs(user.id);

    const list = await call<{ rows: { id: string }[] }>(listStudents);
    expect(list.data.rows.map((r) => r.id)).toEqual([mine.data.id]);
    expect((await call(getStudent, { params: { id: other.data.id } })).status).toBe(404);
    // Teachers lack students.update by default.
    expect((await call(updateStudent, { method: "PATCH", params: { id: mine.data.id }, body: studentBody(s) })).status).toBe(403);
  });

  it("Organization A cannot read, change or place students in Organization B", async () => {
    const b = await school("Beta");
    const bStudent = await call<{ id: string }>(createStudent, { body: studentBody(b) });
    const a = await school("Alpha");

    expect((await call(getStudent, { params: { id: bStudent.data.id } })).status).toBe(404);
    expect((await call(updateStudent, { method: "PATCH", params: { id: bStudent.data.id }, body: studentBody(b) })).status).toBe(404);
    expect((await call(archiveStudent, { method: "DELETE", params: { id: bStudent.data.id } })).status).toBe(404);
    // Placing a student into another org's section/campus.
    expect((await call(createStudent, { body: studentBody(a, { sectionId: b.sectionA }) })).status).toBe(404);
    expect((await call(createStudent, { body: studentBody(b) })).status).toBe(404);
    const untouched = await db.student.findUniqueOrThrow({ where: { id: bStudent.data.id } });
    expect(untouched.archivedAt).toBeNull();
  });
});

describe("bulk import", () => {
  it("previews errors, then imports only valid rows (validated again on the server)", async () => {
    const s = await school();
    const csv = [
      "First Name,Last Name,Gender,Class,Section,Roll No,Guardian Name,Guardian Phone,Date of Birth",
      "Ali,Khan,M,Grade 8,A,5,Imran Khan,+92 300 1111111,2012-01-05",
      "Sara,Ahmed,F,Grade 8,A,5,Ahmed Ali,+92 300 2222222,15/03/2012",
      "Bad,Row,X,Grade 99,A,,,,31/02/2012",
    ].join("\n");
    const file = new File([csv], "../../etc/students list.csv", { type: "text/csv" });
    const preview = await multipart(previewImport, "/api/imports/students/preview", { type: "students" }, file);
    expect(preview.status).toBe(200);
    expect(preview.data.fileName).toBe("students list.csv");
    expect(preview.data.summary).toEqual({ total: 3, valid: 1, invalid: 2 });
    const errors = preview.data.rows.flatMap((r: { errors: { field: string }[] }) => r.errors.map((e) => e.field));
    expect(errors).toEqual(expect.arrayContaining(["Roll No", "Gender", "Class", "Date of Birth"]));

    // User fixes the duplicate roll number; the bad row is sent unchanged and must still fail.
    const rows = preview.data.rows.map((r: { rowNumber: number; values: Record<string, string> }) =>
      r.rowNumber === 3 ? { ...r, values: { ...r.values, "Roll No": "6" } } : r,
    );
    const commit = await call<{ imported: number; failed: number; errors: { row: number }[] }>(commitImport, {
      params: { type: "students" },
      body: { fileName: "students list.csv", rows: rows.map((r: { rowNumber: number; values: Record<string, string> }) => ({ rowNumber: r.rowNumber, values: r.values })) },
    });
    expect(commit.data.imported).toBe(2);
    expect(commit.data.failed).toBe(1);
    expect(commit.data.errors.every((e) => e.row === 4)).toBe(true);
    expect(await db.student.count({ where: { organizationId: s.org.id } })).toBe(2);
  });

  it("rejects disguised and oversized files", async () => {
    await school();
    const exe = new File([Buffer.from([0x4d, 0x5a, 0x00, 0x00, 0x90])], "students.xlsx");
    expect((await multipart(previewImport, "/api/imports/students/preview", { type: "students" }, exe)).status).toBe(400);
    const binaryCsv = new File([Buffer.from([0x41, 0x00, 0x42])], "students.csv");
    expect((await multipart(previewImport, "/api/imports/students/preview", { type: "students" }, binaryCsv)).status).toBe(400);
    const big = new File([Buffer.alloc(6 * 1024 * 1024, 0x41)], "big.csv");
    expect((await multipart(previewImport, "/api/imports/students/preview", { type: "students" }, big)).status).toBe(400);
  });

  it("blocks imports for roles without permission", async () => {
    const s = await school();
    const accountant = await createUser({ organizationId: s.org.id, roles: s.roles }, "accountant");
    await signInAs(accountant.id);
    const res = await call(commitImport, { params: { type: "students" }, body: { fileName: "x.csv", rows: [{ rowNumber: 2, values: { "First Name": "X" } }] } });
    expect(res.status).toBe(403);
  });
});

describe("documents", () => {
  it("accepts real PDFs, rejects spoofed files, and isolates organizations", async () => {
    const b = await school("Beta");
    const bStudent = await call<{ id: string }>(createStudent, { body: studentBody(b) });
    const pdf = new File([Buffer.from("%PDF-1.7\n%âã\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF")], "b-form.pdf");
    const ok = await multipart(uploadDocument, "/api/documents", {}, pdf, { title: "B-Form", category: "STUDENT", entityType: "student", entityId: bStudent.data.id });
    expect(ok.status).toBe(201);

    const fake = new File([Buffer.from("MZ this is an exe")], "report.pdf");
    const spoof = await multipart(uploadDocument, "/api/documents", {}, fake, { title: "x", category: "GENERAL" });
    expect(spoof.status).toBe(400);

    await school("Alpha");
    expect((await call(deleteDocument, { method: "DELETE", params: { id: ok.data.id } })).status).toBe(404);
    const upToB = await multipart(uploadDocument, "/api/documents", {}, pdf, { title: "x", category: "STUDENT", entityType: "student", entityId: bStudent.data.id });
    expect(upToB.status).toBe(404);
  });
});

describe("staff", () => {
  it("creates a teacher, invites them, and links their login on acceptance", async () => {
    const s = await school();
    const email = `teacher-${Date.now()}@school.test`;
    const res = await call<{ id: string; employeeCode: string }>(createStaff, {
      body: { firstName: "Sara", lastName: "Malik", campusId: s.campus.id, designation: "Senior Teacher", email, isTeacher: true, inviteToSignIn: true },
    });
    expect(res.status).toBe(201);
    expect(res.data.employeeCode).toMatch(/^EMP-\d{3}$/);
    expect(await db.teacher.count({ where: { staffId: res.data.id } })).toBe(1);

    const invitation = await db.invitation.findFirstOrThrow({ where: { email } });
    const token = `invite-${crypto.randomUUID()}`;
    await db.invitation.update({ where: { id: invitation.id }, data: { tokenHash: hashToken(token) } });
    signOut();
    await call(acceptInvite, { body: { token, firstName: "Sara", lastName: "Malik", password: "TeachPass123", confirmPassword: "TeachPass123" } });
    const staff = await db.staff.findUniqueOrThrow({ where: { id: res.data.id }, include: { user: { include: { roles: { include: { role: true } } } } } });
    expect(staff.user?.email).toBe(email);
    expect(staff.user?.roles.map((r) => r.role.key)).toEqual(["teacher"]);
  });

  it("requires teachers.manage to create teachers", async () => {
    const s = await school();
    const accountant = await createUser({ organizationId: s.org.id, roles: s.roles }, "accountant");
    await signInAs(accountant.id);
    const res = await call(createStaff, { body: { firstName: "X", lastName: "Y", campusId: s.campus.id, designation: "Teacher", isTeacher: true } });
    expect(res.status).toBe(403);
  });
});
