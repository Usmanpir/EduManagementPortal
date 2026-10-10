import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { GET as getRegister, POST as saveRegister } from "@/app/api/attendance/register/route";
import { GET as overview } from "@/app/api/attendance/overview/route";
import { POST as requestCorrection } from "@/app/api/attendance/corrections/route";
import { POST as reviewCorrection } from "@/app/api/attendance/corrections/[id]/route";
import { POST as saveStaff } from "@/app/api/attendance/staff/route";
import { POST as checkIn } from "@/app/api/attendance/check-in/route";
import { POST as devicePunch } from "@/app/api/devices/attendance/route";
import { POST as issueKey } from "@/app/api/settings/device-key/route";
import { POST as createLeave } from "@/app/api/leave/route";
import { POST as reviewLeave } from "@/app/api/leave/[id]/route";
import { POST as createClass } from "@/app/api/classes/route";
import { checkInToken } from "@/server/modules/attendance/staff";
import { addDays, todayIn } from "@/lib/format";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";
import { NextRequest } from "next/server";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

const today = () => todayIn("Asia/Karachi");

/** An org with one class/section, three students (one with a parent login) and a class teacher. */
async function school(name = "School") {
  const org = await createOrg(name);
  await signInAs(org.admin.id);
  const cls = await call<{ id: string }>(createClass, { body: { name: "Grade 6", level: 6, campusId: org.campus.id, sections: ["A", "B"] } });
  const [sectionA, sectionB] = await db.section.findMany({ where: { classId: cls.data.id }, orderBy: { name: "asc" } });
  const mk = (first: string, sectionId: string, roll: number) =>
    db.student.create({ data: { organizationId: org.org.id, campusId: org.campus.id, classId: cls.data.id, sectionId, admissionNo: `A-${first}-${Date.now()}-${roll}`, rollNumber: String(roll), rollOrder: roll, firstName: first, lastName: "Test" } });
  const students = [await mk("Ali", sectionA!.id, 1), await mk("Sara", sectionA!.id, 2), await mk("Zain", sectionA!.id, 3)];
  const other = await mk("Omar", sectionB!.id, 1);

  const parentUser = await createUser({ organizationId: org.org.id, roles: org.roles }, "parent");
  const guardian = await db.guardian.create({ data: { organizationId: org.org.id, firstName: "Kamran", lastName: "Test", phone: "+92 300 1234567", userId: parentUser.id } });
  await db.studentGuardian.create({ data: { organizationId: org.org.id, studentId: students[0]!.id, guardianId: guardian.id, isPrimary: true } });

  const teacherUser = await createUser({ organizationId: org.org.id, roles: org.roles }, "teacher", { campusId: org.campus.id });
  const staff = await db.staff.create({ data: { organizationId: org.org.id, campusId: org.campus.id, userId: teacherUser.id, employeeCode: `T-${Date.now()}`, firstName: "Sana", lastName: "Teacher", designation: "Teacher" } });
  await db.teacher.create({ data: { organizationId: org.org.id, staffId: staff.id } });
  await db.section.update({ where: { id: sectionA!.id }, data: { classTeacherId: staff.id } });

  return { ...org, sectionA: sectionA!, sectionB: sectionB!, students, other, parentUser, teacherUser, staff };
}

const records = (students: { id: string }[], statuses: string[]) => students.map((s, i) => ({ studentId: s.id, status: statuses[i] ?? "PRESENT" }));

describe("student registers", () => {
  it("teacher marks today's register; parent is notified about the absence; overview reflects it", async () => {
    const s = await school();
    await signInAs(s.teacherUser.id);
    const reg = await call<{ access: string; students: { id: string; status: string | null }[] }>(getRegister, { query: { sectionId: s.sectionA.id, date: today() } });
    expect(reg.data.access).toBe("edit");
    expect(reg.data.students.map((x) => x.status)).toEqual([null, null, null]);

    const saved = await call<{ counts: Record<string, number>; notified: number }>(saveRegister, {
      body: { sectionId: s.sectionA.id, date: today(), records: records(s.students, ["ABSENT", "PRESENT", "LATE"]) },
    });
    expect(saved.status).toBe(200);
    expect(saved.data.counts).toEqual({ present: 1, absent: 1, late: 1, leave: 0 });
    expect(saved.data.notified).toBe(1);

    const note = await db.notification.findFirst({ where: { userId: s.parentUser.id, type: "attendance.absent" } });
    expect(note?.body).toBe("Ali Test was marked absent today.");

    // Saving again (e.g. a double tap) never duplicates records or notifications.
    await call(saveRegister, { body: { sectionId: s.sectionA.id, date: today(), records: records(s.students, ["ABSENT", "PRESENT", "LATE"]) } });
    expect(await db.attendance.count({ where: { sectionId: s.sectionA.id } })).toBe(3);
    expect(await db.notification.count({ where: { userId: s.parentUser.id, type: "attendance.absent" } })).toBe(1);

    const ov = await call<{ summary: { absent: number; submitted: number }; items: { sectionId: string; mine: boolean; submitted: boolean }[] }>(overview);
    expect(ov.data.items).toEqual([expect.objectContaining({ sectionId: s.sectionA.id, mine: true, submitted: true })]);
    expect(ov.data.summary.absent).toBe(1);
  });

  it("requires every student to be marked", async () => {
    const s = await school();
    const res = await call(saveRegister, { body: { sectionId: s.sectionA.id, date: today(), records: records(s.students.slice(0, 2), []) } });
    expect(res.status).toBe(400);
    expect(res.error?.message).toMatch(/1 still needs a status/);
  });

  it("enforces one record per student per day at the database level", async () => {
    const s = await school();
    await call(saveRegister, { body: { sectionId: s.sectionA.id, date: today(), records: records(s.students, []) } });
    const session = await db.attendanceSession.findFirstOrThrow({ where: { sectionId: s.sectionA.id } });
    await expect(
      db.attendance.create({
        data: { organizationId: s.org.id, campusId: s.campus.id, sessionId: session.id, studentId: s.students[0]!.id, sectionId: s.sectionA.id, date: session.date, slot: "DAY", status: "ABSENT" },
      }),
    ).rejects.toThrow();
  });

  it("teachers can't mark sections they aren't assigned to, or future dates", async () => {
    const s = await school();
    await signInAs(s.teacherUser.id);
    expect((await call(getRegister, { query: { sectionId: s.sectionB.id, date: today() } })).status).toBe(403);
    expect((await call(saveRegister, { body: { sectionId: s.sectionB.id, date: today(), records: records([s.other], []) } })).status).toBe(403);
    const future = await call(saveRegister, { body: { sectionId: s.sectionA.id, date: addDays(today(), 1), records: records(s.students, []) } });
    expect(future.status).toBe(400);
  });

  it("locks old registers for teachers; corrections need admin approval", async () => {
    const s = await school();
    const old = addDays(today(), -5);
    await call(saveRegister, { body: { sectionId: s.sectionA.id, date: old, records: records(s.students, ["ABSENT"]) } });

    await signInAs(s.teacherUser.id);
    const reg = await call<{ access: string }>(getRegister, { query: { sectionId: s.sectionA.id, date: old } });
    expect(reg.data.access).toBe("request-correction");
    expect((await call(saveRegister, { body: { sectionId: s.sectionA.id, date: old, records: records(s.students, []) } })).status).toBe(403);

    const req = await call(requestCorrection, { body: { sectionId: s.sectionA.id, date: old, reason: "Arrived after roll call", changes: [{ studentId: s.students[0]!.id, status: "LATE" }] } });
    expect(req.status).toBe(201);
    const correction = await db.attendanceCorrection.findFirstOrThrow({ where: { organizationId: s.org.id, status: "PENDING" } });
    // Teachers can't approve.
    expect((await call(reviewCorrection, { params: { id: correction.id }, body: { decision: "APPROVED" } })).status).toBe(403);

    await signInAs(s.admin.id);
    expect((await call(reviewCorrection, { params: { id: correction.id }, body: { decision: "APPROVED" } })).status).toBe(200);
    const rec = await db.attendance.findFirstOrThrow({ where: { studentId: s.students[0]!.id, date: new Date(`${old}T00:00:00Z`) } });
    expect(rec.status).toBe("LATE");
    const session = await db.attendanceSession.findFirstOrThrow({ where: { id: rec.sessionId } });
    expect([session.absentCount, session.lateCount]).toEqual([0, 1]);
  });

  it("Organization A cannot read or write Organization B's registers", async () => {
    const b = await school("Beta");
    const a = await school("Alpha");
    expect((await call(getRegister, { query: { sectionId: b.sectionA.id, date: today() } })).status).toBe(404);
    const res = await call(saveRegister, { body: { sectionId: b.sectionA.id, date: today(), records: records(b.students, []) } });
    expect(res.status).toBe(404);
    // Mixing another org's student into our own section is refused.
    const mixed = await call(saveRegister, { body: { sectionId: a.sectionA.id, date: today(), records: [...records(a.students, []), { studentId: b.students[0]!.id, status: "PRESENT" }] } });
    expect(mixed.status).toBe(400);
    expect(await db.attendance.count({ where: { organizationId: b.org.id } })).toBe(0);
  });
});

describe("leave", () => {
  it("parent requests leave for their own child only; approval excuses recorded absences", async () => {
    const s = await school();
    const date = addDays(today(), -1);
    await call(saveRegister, { body: { sectionId: s.sectionA.id, date, records: records(s.students, ["ABSENT"]) } });

    await signInAs(s.parentUser.id);
    const forOther = await call(createLeave, { body: { requesterType: "STUDENT", studentId: s.students[1]!.id, type: "SICK", startDate: date, endDate: date, reason: "Fever" } });
    expect(forOther.status).toBe(404);
    const req = await call<{ id: string }>(createLeave, { body: { requesterType: "STUDENT", studentId: s.students[0]!.id, type: "SICK", startDate: date, endDate: date, reason: "Fever" } });
    expect(req.status).toBe(201);
    const overlap = await call(createLeave, { body: { requesterType: "STUDENT", studentId: s.students[0]!.id, type: "SICK", startDate: date, endDate: date, reason: "Again" } });
    expect(overlap.status).toBe(409);
    expect((await call(reviewLeave, { params: { id: req.data.id }, body: { decision: "APPROVED" } })).status).toBe(403);

    await signInAs(s.admin.id);
    expect((await call(reviewLeave, { params: { id: req.data.id }, body: { decision: "APPROVED", note: "Get well soon" } })).status).toBe(200);
    const rec = await db.attendance.findFirstOrThrow({ where: { studentId: s.students[0]!.id } });
    expect(rec.status).toBe("LEAVE");
    expect(await db.notification.count({ where: { userId: s.parentUser.id, type: "leave.reviewed" } })).toBe(1);
  });
});

describe("staff attendance", () => {
  it("records manual attendance, QR check-in/out, and device punches", async () => {
    const s = await school();
    const saved = await call(saveStaff, { body: { date: today(), records: [{ staffId: s.staff.id, status: "PRESENT", checkIn: "07:55" }] } });
    expect(saved.status).toBe(200);
    await db.staffAttendance.deleteMany({ where: { staffId: s.staff.id } });

    await signInAs(s.teacherUser.id);
    const bad = await call(checkIn, { body: { campusId: s.campus.id, token: "not-today's-token-xyz" } });
    expect(bad.status).toBe(400);
    const ok = await call<{ action: string }>(checkIn, { body: { campusId: s.campus.id, token: checkInToken(s.org.id, s.campus.id, today()) } });
    expect(ok.data.action).toBe("check-in");

    await signInAs(s.admin.id);
    const key = await call<{ key: string }>(issueKey, { body: {} });
    const punch = (authorization: string) =>
      devicePunch(
        new NextRequest("http://localhost:3000/api/devices/attendance", {
          method: "POST",
          headers: { authorization, "content-type": "application/json" },
          body: JSON.stringify({ punches: [{ employeeCode: s.staff.employeeCode, timestamp: new Date(Date.now() - 60_000).toISOString() }, { employeeCode: "NOPE", timestamp: new Date().toISOString() }] }),
        }),
        { params: Promise.resolve({}) },
      );
    expect((await punch("Bearer ead_wrong.key-that-is-long-enough")).status).toBe(401);
    const res = await punch(`Bearer ${key.data.key}`);
    const json = (await res.json()) as { data: { results: { result: string }[] } };
    expect(res.status).toBe(200);
    expect(json.data.results.map((r) => r.result)).toEqual(expect.arrayContaining(["unknown_employee"]));
  });
});
