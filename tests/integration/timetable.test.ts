import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { PUT as savePeriods } from "@/app/api/timetable/periods/route";
import { PUT as setEntry } from "@/app/api/timetable/entries/route";
import { GET as getTimetable } from "@/app/api/timetable/route";
import { POST as createClass } from "@/app/api/classes/route";
import { POST as createSubject } from "@/app/api/subjects/route";
import { PUT as setClassSubjects } from "@/app/api/classes/[id]/subjects/route";
import { call, createOrg, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

async function school(name = "School") {
  const org = await createOrg(name);
  await signInAs(org.admin.id);
  const cls = await call<{ id: string }>(createClass, { body: { name: "Grade 7", level: 7, campusId: org.campus.id, sections: ["A", "B"] } });
  const subject = await call<{ id: string }>(createSubject, { body: { name: "Maths", code: `M${Date.now() % 1000}`, type: "CORE" } });
  await call(setClassSubjects, { method: "PUT", params: { id: cls.data.id }, body: { subjects: [{ subjectId: subject.data.id, periodsPerWeek: 5 }] } });
  const [a, b] = await db.section.findMany({ where: { classId: cls.data.id }, orderBy: { name: "asc" } });
  const res = await call(savePeriods, {
    method: "PUT",
    body: {
      campusId: org.campus.id,
      periods: [
        { name: "Period 1", start: "08:00", end: "08:40" },
        { name: "Break", start: "08:40", end: "09:00", isBreak: true },
        { name: "Period 2", start: "09:00", end: "09:40" },
      ],
    },
  });
  expect(res.status).toBe(200);
  const periods = await db.period.findMany({ where: { campusId: org.campus.id }, orderBy: { sortOrder: "asc" } });
  const staff = await db.staff.create({ data: { organizationId: org.org.id, campusId: org.campus.id, employeeCode: `E${Date.now()}`, firstName: "Imran", lastName: "Ali", designation: "Teacher" } });
  const teacher = await db.teacher.create({ data: { organizationId: org.org.id, staffId: staff.id } });
  const room = await db.room.create({ data: { organizationId: org.org.id, campusId: org.campus.id, name: "Lab 1", type: "LAB" } });
  return { ...org, a: a!, b: b!, subjectId: subject.data.id, periods, teacher, room };
}

describe("timetable", () => {
  it("rejects overlapping periods in the bell schedule", async () => {
    const s = await school();
    const res = await call(savePeriods, {
      method: "PUT",
      body: { campusId: s.campus.id, periods: [{ name: "P1", start: "08:00", end: "08:40" }, { name: "P2", start: "08:30", end: "09:10" }] },
    });
    expect(res.status).toBe(422);
  });

  it("schedules lessons and blocks teacher and room double-booking", async () => {
    const s = await school();
    const p1 = s.periods[0]!.id;
    const base = { dayOfWeek: 1, periodId: p1, subjectId: s.subjectId, teacherId: s.teacher.id, roomId: s.room.id };
    expect((await call(setEntry, { method: "PUT", body: { ...base, sectionId: s.a.id } })).status).toBe(200);

    const teacherClash = await call(setEntry, { method: "PUT", body: { ...base, sectionId: s.b.id, roomId: null } });
    expect(teacherClash.status).toBe(409);
    expect(teacherClash.error?.fields?.teacherId).toMatch(/already teaches Grade 7-A on Monday Period 1/);

    const roomClash = await call(setEntry, { method: "PUT", body: { ...base, sectionId: s.b.id, teacherId: null } });
    expect(roomClash.status).toBe(409);
    expect(roomClash.error?.fields?.roomId).toMatch(/Lab 1 is already booked/);

    // Same slot for the same section replaces the lesson rather than duplicating it.
    expect((await call(setEntry, { method: "PUT", body: { ...base, sectionId: s.a.id, roomId: null } })).status).toBe(200);
    expect(await db.timetableEntry.count({ where: { sectionId: s.a.id } })).toBe(1);

    const view = await call<{ entries: { teacher: string }[] }>(getTimetable, { query: { kind: "teacher", id: s.teacher.id } });
    expect(view.data.entries).toHaveLength(1);
  });

  it("refuses breaks and subjects the class doesn't take", async () => {
    const s = await school();
    const breakRes = await call(setEntry, { method: "PUT", body: { sectionId: s.a.id, dayOfWeek: 1, periodId: s.periods[1]!.id, subjectId: s.subjectId } });
    expect(breakRes.status).toBe(400);
    const other = await call<{ id: string }>(createSubject, { body: { name: "Art", code: `ART${Date.now() % 1000}`, type: "ACTIVITY" } });
    const notOffered = await call(setEntry, { method: "PUT", body: { sectionId: s.a.id, dayOfWeek: 1, periodId: s.periods[0]!.id, subjectId: other.data.id } });
    expect(notOffered.status).toBe(400);
  });

  it("can't use another organization's teacher, room or section", async () => {
    const b = await school("Beta");
    const a = await school("Alpha");
    const base = { dayOfWeek: 2, periodId: a.periods[0]!.id, subjectId: a.subjectId, sectionId: a.a.id };
    expect((await call(setEntry, { method: "PUT", body: { ...base, teacherId: b.teacher.id } })).status).toBe(404);
    expect((await call(setEntry, { method: "PUT", body: { ...base, roomId: b.room.id } })).status).toBe(404);
    expect((await call(setEntry, { method: "PUT", body: { ...base, sectionId: b.a.id } })).status).toBe(404);
    expect((await call(getTimetable, { query: { kind: "section", id: b.a.id } })).status).toBe(404);
  });
});
