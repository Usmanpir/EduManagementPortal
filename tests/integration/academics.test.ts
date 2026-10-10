import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { GET as listClasses, POST as createClass } from "@/app/api/classes/route";
import { GET as getClass, DELETE as archiveClass } from "@/app/api/classes/[id]/route";
import { PUT as setClassSubjects } from "@/app/api/classes/[id]/subjects/route";
import { POST as createSection } from "@/app/api/sections/route";
import { POST as createSubject } from "@/app/api/subjects/route";
import { POST as createRoom } from "@/app/api/rooms/route";
import { POST as createYear } from "@/app/api/academic-years/route";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

async function setupOrgWithClass(name = "School") {
  const org = await createOrg(name);
  await signInAs(org.admin.id);
  const cls = await call<{ id: string }>(createClass, { body: { name: "Grade 5", level: 5, campusId: org.campus.id, sections: ["A", "B"] } });
  expect(cls.status).toBe(201);
  return { ...org, classId: cls.data.id };
}

describe("academic structure", () => {
  it("creates a class with sections, subjects and lists them", async () => {
    const org = await setupOrgWithClass();
    const subject = await call<{ id: string }>(createSubject, { body: { name: "Mathematics", code: "math", type: "CORE" } });
    expect(subject.status).toBe(201);
    const set = await call(setClassSubjects, { method: "PUT", params: { id: org.classId }, body: { subjects: [{ subjectId: subject.data.id, periodsPerWeek: 6 }] } });
    expect(set.status).toBe(200);

    const detail = await call<{ name: string; sections: { name: string }[]; subjects: { subject: { code: string } }[] }>(getClass, { params: { id: org.classId } });
    expect(detail.data.sections.map((s) => s.name)).toEqual(["A", "B"]);
    expect(detail.data.subjects.map((s) => s.subject.code)).toEqual(["MATH"]);

    const list = await call<{ name: string; sections: unknown[] }[]>(listClasses);
    expect(list.data).toHaveLength(1);
    expect(list.data[0]!.sections).toHaveLength(2);
  });

  it("rejects duplicates with field-level messages", async () => {
    const org = await setupOrgWithClass();
    const dupClass = await call(createClass, { body: { name: "Grade 5", level: 5, campusId: org.campus.id } });
    expect(dupClass.status).toBe(409);
    expect(dupClass.error?.fields?.name).toBeTruthy();
    const dupSection = await call(createSection, { body: { classId: org.classId, name: "a" } });
    expect(dupSection.status).toBe(409);
  });

  it("validates date ranges for academic years and keeps only one current year", async () => {
    await setupOrgWithClass();
    const bad = await call(createYear, { body: { name: "Backwards", startDate: "2026-08-01", endDate: "2026-01-01" } });
    expect(bad.status).toBe(422);
    expect(bad.error?.fields?.endDate).toBeTruthy();

    const y1 = await call<{ id: string; isCurrent: boolean }>(createYear, { body: { name: "2025–2026", startDate: "2025-08-01", endDate: "2026-06-30" } });
    expect(y1.data.isCurrent).toBe(true); // first year becomes current
    const y2 = await call<{ id: string }>(createYear, { body: { name: "2026–2027", startDate: "2026-08-01", endDate: "2027-06-30", isCurrent: true } });
    const current = await db.academicYear.findMany({ where: { id: { in: [y1.data.id, y2.data.id] }, isCurrent: true } });
    expect(current.map((c) => c.id)).toEqual([y2.data.id]);
  });

  it("refuses to archive a class that still has active students", async () => {
    const org = await setupOrgWithClass();
    const section = await db.section.findFirstOrThrow({ where: { classId: org.classId } });
    await db.student.create({
      data: { organizationId: org.org.id, campusId: org.campus.id, classId: org.classId, sectionId: section.id, admissionNo: `S-${Date.now()}`, firstName: "Ali", lastName: "Khan" },
    });
    const res = await call(archiveClass, { method: "DELETE", params: { id: org.classId } });
    expect(res.status).toBe(400);
    expect(res.error?.message).toMatch(/active students/);
  });
});

describe("academic tenant isolation", () => {
  it("cannot attach records to another organization's class, campus or room", async () => {
    const b = await setupOrgWithClass("Beta");
    const bRoom = await call<{ id: string }>(createRoom, { body: { name: "Room 1", campusId: b.campus.id, type: "CLASSROOM" } });

    const a = await setupOrgWithClass("Alpha");
    expect((await call(getClass, { params: { id: b.classId } })).status).toBe(404);
    expect((await call(createSection, { body: { classId: b.classId, name: "Z" } })).status).toBe(404);
    // Foreign ids are indistinguishable from ids that don't exist.
    expect((await call(createClass, { body: { name: "Grade 9", level: 9, campusId: b.campus.id } })).status).toBe(404);
    expect((await call(createSection, { body: { classId: a.classId, name: "C", roomId: bRoom.data.id } })).status).toBe(404);
    expect((await call(archiveClass, { method: "DELETE", params: { id: b.classId } })).status).toBe(404);

    const still = await db.class.findUniqueOrThrow({ where: { id: b.classId } });
    expect(still.deletedAt).toBeNull();
  });

  it("teachers only see classes they're assigned to", async () => {
    const org = await setupOrgWithClass();
    const other = await call<{ id: string }>(createClass, { body: { name: "Grade 6", level: 6, campusId: org.campus.id, sections: ["A"] } });
    const teacherUser = await createUser({ organizationId: org.org.id, roles: org.roles }, "teacher");
    const staff = await db.staff.create({
      data: { organizationId: org.org.id, campusId: org.campus.id, userId: teacherUser.id, employeeCode: `T-${Date.now()}`, firstName: "Sara", lastName: "Malik", designation: "Teacher" },
    });
    await db.teacher.create({ data: { organizationId: org.org.id, staffId: staff.id } });
    const sectionA = await db.section.findFirstOrThrow({ where: { classId: org.classId, name: "A" } });
    await db.section.update({ where: { id: sectionA.id }, data: { classTeacherId: staff.id } });

    await signInAs(teacherUser.id);
    const list = await call<{ id: string; sections: { id: string }[] }[]>(listClasses);
    expect(list.data.map((c) => c.id)).toEqual([org.classId]);
    expect(list.data[0]!.sections.map((s) => s.id)).toEqual([sectionA.id]);
    expect((await call(getClass, { params: { id: other.data.id } })).status).toBe(404);
    expect((await call(createClass, { body: { name: "Grade 7", level: 7, campusId: org.campus.id } })).status).toBe(403);
  });
});
