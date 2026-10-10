import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { POST as createClass } from "@/app/api/classes/route";
import { GET as listAnnouncements, POST as createAnnouncement } from "@/app/api/announcements/route";
import { PUT as editAnnouncement } from "@/app/api/announcements/[id]/route";
import { POST as publishAnnouncement } from "@/app/api/announcements/[id]/publish/route";
import { POST as preview } from "@/app/api/announcements/preview/route";
import { GET as getIntegrations, PUT as saveIntegration } from "@/app/api/settings/integrations/route";
import { PATCH as patchSettings } from "@/app/api/settings/[section]/route";
import { POST as markRead } from "@/app/api/notifications/read/route";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

/** Two classes; a parent with an app login in each; a class teacher of class A. */
async function school(name = "School") {
  const org = await createOrg(name);
  await signInAs(org.admin.id);
  const mkClass = async (n: string, level: number) => {
    const c = await call<{ id: string }>(createClass, { body: { name: n, level, campusId: org.campus.id, sections: ["A"] } });
    const section = await db.section.findFirstOrThrow({ where: { classId: c.data.id } });
    return { id: c.data.id, sectionId: section.id };
  };
  const a = await mkClass("Grade 5", 5);
  const b = await mkClass("Grade 6", 6);
  const family = async (first: string, cls: { id: string; sectionId: string }, phone: string) => {
    const student = await db.student.create({ data: { organizationId: org.org.id, campusId: org.campus.id, classId: cls.id, sectionId: cls.sectionId, admissionNo: `C-${first}-${Date.now()}`, firstName: first, lastName: "Test" } });
    const user = await createUser({ organizationId: org.org.id, roles: org.roles }, "parent");
    const guardian = await db.guardian.create({ data: { organizationId: org.org.id, firstName: "Parent", lastName: first, phone, whatsapp: phone, userId: user.id } });
    await db.studentGuardian.create({ data: { organizationId: org.org.id, studentId: student.id, guardianId: guardian.id, isPrimary: true } });
    return { student, user };
  };
  const famA = await family("Ali", a, "+923001110001");
  const famB = await family("Omar", b, "+923001110002");
  // A parent without an app login is still reachable by phone.
  const studentA2 = await db.student.create({ data: { organizationId: org.org.id, campusId: org.campus.id, classId: a.id, sectionId: a.sectionId, admissionNo: `C-Noor-${Date.now()}`, firstName: "Noor", lastName: "Test" } });
  const offline = await db.guardian.create({ data: { organizationId: org.org.id, firstName: "Offline", lastName: "Parent", phone: "+923001110003" } });
  await db.studentGuardian.create({ data: { organizationId: org.org.id, studentId: studentA2.id, guardianId: offline.id, isPrimary: true } });

  const teacherUser = await createUser({ organizationId: org.org.id, roles: org.roles }, "teacher");
  const staff = await db.staff.create({ data: { organizationId: org.org.id, campusId: org.campus.id, userId: teacherUser.id, employeeCode: `T-${Date.now()}`, firstName: "Sana", lastName: "Teacher", designation: "Teacher" } });
  await db.teacher.create({ data: { organizationId: org.org.id, staffId: staff.id } });
  await db.section.update({ where: { id: a.sectionId }, data: { classTeacherId: staff.id } });
  return { ...org, a, b, famA, famB, teacherUser };
}

const notice = (o: Record<string, unknown> = {}) => ({ title: "Parent meeting", body: "Saturday at 9.", audience: "CLASS", channels: [], ...o });

describe("announcements", () => {
  it("previews reach, then delivers only to the chosen class (incl. its teacher)", async () => {
    const s = await school();
    const reach = await call<{ people: number; groups: { parents: number; staff: number }; inApp: number }>(preview, { body: { audience: "CLASS", audienceRefId: s.a.id, channels: [] } });
    expect(reach.data.groups.parents).toBe(2);
    expect(reach.data.groups.staff).toBe(1);
    expect(reach.data.inApp).toBe(2); // the online parent + the teacher

    const sent = await call<{ id: string; sent: { people: number } }>(createAnnouncement, { body: notice({ audienceRefId: s.a.id, publish: true }) });
    expect(sent.status).toBe(201);
    expect(sent.data.sent.people).toBe(3);
    const got = async (userId: string) => db.notification.count({ where: { userId, entityId: sent.data.id } });
    expect(await got(s.famA.user.id)).toBe(1);
    expect(await got(s.teacherUser.id)).toBe(1);
    expect(await got(s.famB.user.id)).toBe(0);

    // What each parent can see.
    await signInAs(s.famA.user.id);
    expect((await call<{ total: number }>(listAnnouncements)).data.total).toBe(1);
    await signInAs(s.famB.user.id);
    expect((await call<{ total: number }>(listAnnouncements)).data.total).toBe(0);
  });

  it("sends WhatsApp only when chosen and enabled, and never twice", async () => {
    const s = await school();
    await call(patchSettings, { method: "PATCH", params: { section: "notifications" }, body: { whatsapp: true } });
    const draft = await call<{ id: string }>(createAnnouncement, { body: notice({ audienceRefId: s.a.id, channels: ["WHATSAPP"] }) });
    expect(draft.status).toBe(201);
    expect(await db.notificationDelivery.count({ where: { organizationId: s.org.id } })).toBe(0); // drafts send nothing

    const sent = await call(publishAnnouncement, { params: { id: draft.data.id } });
    expect(sent.status).toBe(200);
    const deliveries = await db.notificationDelivery.findMany({ where: { organizationId: s.org.id } });
    expect(deliveries.map((d) => d.channel)).toEqual(["WHATSAPP", "WHATSAPP"]);
    expect(deliveries.map((d) => d.recipient).sort()).toEqual(["+923001110001", "+923001110003"]);

    expect((await call(publishAnnouncement, { params: { id: draft.data.id } })).status).toBe(400);
    expect((await call(editAnnouncement, { method: "PUT", params: { id: draft.data.id }, body: notice({ audienceRefId: s.a.id }) })).status).toBe(400);
    expect(await db.notificationDelivery.count({ where: { organizationId: s.org.id } })).toBe(2);
  });

  it("only managers can post; teachers can read", async () => {
    const s = await school();
    await signInAs(s.teacherUser.id);
    expect((await call(createAnnouncement, { body: notice({ audience: "ORGANIZATION" }) })).status).toBe(403);
    expect((await call(preview, { body: { audience: "ORGANIZATION" } })).status).toBe(403);
    expect((await call(listAnnouncements)).status).toBe(200);
  });

  it("can't target or touch another school's classes or announcements", async () => {
    const a = await school("Alpha");
    const draft = await call<{ id: string }>(createAnnouncement, { body: notice({ audienceRefId: a.a.id }) });
    const b = await school("Beta");
    await signInAs(b.admin.id);
    expect((await call(preview, { body: { audience: "CLASS", audienceRefId: a.a.id } })).status).toBe(404);
    expect((await call(createAnnouncement, { body: notice({ audienceRefId: a.a.id, publish: true }) })).status).toBe(404);
    expect((await call(publishAnnouncement, { params: { id: draft.data.id } })).status).toBe(404);
    expect((await call(editAnnouncement, { method: "PUT", params: { id: draft.data.id }, body: notice({ audienceRefId: b.a.id }) })).status).toBe(404);
    expect(await db.notification.count({ where: { entityId: draft.data.id } })).toBe(0);
  });
});

describe("integrations & notifications", () => {
  it("stores credentials encrypted and only ever returns them masked", async () => {
    const s = await school();
    const token = "EAAGsecretTokenValue123456";
    const saved = await call(saveIntegration, { method: "PUT", body: { provider: "whatsapp_cloud", isEnabled: true, config: { phoneNumberId: "1234567890", accessToken: token } } });
    expect(saved.status).toBe(200);
    const row = await db.integrationCredential.findFirstOrThrow({ where: { organizationId: s.org.id } });
    expect(row.encryptedConfig).not.toContain(token);
    expect(row.encryptedConfig).not.toContain("1234567890");

    const status = await call<{ whatsapp: { accessToken: string; phoneNumberId: string } }>(getIntegrations);
    expect(status.data.whatsapp.accessToken).toBe("EAAG…3456");
    expect(JSON.stringify(status)).not.toContain(token);
    // A blank token keeps the stored one.
    await call(saveIntegration, { method: "PUT", body: { provider: "whatsapp_cloud", isEnabled: true, config: { phoneNumberId: "999", accessToken: "" } } });
    expect((await call<{ whatsapp: { accessToken: string } }>(getIntegrations)).data.whatsapp.accessToken).toBe("EAAG…3456");
    const audit = await db.auditLog.findMany({ where: { organizationId: s.org.id, action: "integration.update" } });
    expect(JSON.stringify(audit)).not.toContain(token);

    await signInAs(s.teacherUser.id);
    expect((await call(getIntegrations)).status).toBe(403);
  });

  it("users can only mark their own notifications read", async () => {
    const s = await school();
    const sent = await call<{ id: string }>(createAnnouncement, { body: notice({ audienceRefId: s.a.id, publish: true }) });
    const teacherNote = await db.notification.findFirstOrThrow({ where: { userId: s.teacherUser.id, entityId: sent.data.id } });
    await signInAs(s.famA.user.id);
    const res = await call<{ count: number }>(markRead, { body: { ids: [teacherNote.id] } });
    expect(res.data.count).toBe(0);
    expect((await db.notification.findUniqueOrThrow({ where: { id: teacherNote.id } })).readAt).toBeNull();
  });
});
