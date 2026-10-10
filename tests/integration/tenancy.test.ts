import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { tenantDb } from "@/server/db/tenant";
import { hashToken } from "@/server/auth/crypto";
import { GET as listCampuses, POST as createCampus } from "@/app/api/campuses/route";
import { PATCH as updateCampus, DELETE as archiveCampus } from "@/app/api/campuses/[id]/route";
import { GET as listUsers } from "@/app/api/users/route";
import { PATCH as updateUser } from "@/app/api/users/[id]/route";
import { POST as invite } from "@/app/api/invitations/route";
import { DELETE as revokeInvite } from "@/app/api/invitations/[id]/route";
import { PATCH as updateRole } from "@/app/api/roles/[id]/route";
import { PUT as switchCampus } from "@/app/api/auth/campus/route";
import { POST as acceptInvite } from "@/app/api/auth/accept-invite/route";
import { GET as me } from "@/app/api/auth/me/route";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

describe("tenant-scoped client", () => {
  it("cannot see, change or delete another organization's rows", async () => {
    const a = await createOrg("Alpha");
    const b = await createOrg("Beta");
    const dbA = tenantDb(a.org.id);

    expect(await dbA.campus.findUnique({ where: { id: b.campus.id } })).toBeNull();
    expect(await dbA.campus.findMany({ where: { id: b.campus.id } })).toEqual([]);
    expect(await dbA.user.count({ where: { id: b.admin.id } })).toBe(0);
    await expect(dbA.campus.update({ where: { id: b.campus.id }, data: { name: "Hijacked" } })).rejects.toThrow();
    expect((await dbA.campus.deleteMany({ where: { id: b.campus.id } })).count).toBe(0);
    await expect(dbA.campus.create({ data: { organizationId: b.org.id, name: "Sneaky", code: "SNK" } })).rejects.toThrow(/another organization/);

    const untouched = await db.campus.findUniqueOrThrow({ where: { id: b.campus.id } });
    expect(untouched.name).toBe("Main Campus");
  });
});

describe("cross-tenant API access", () => {
  it("Organization A admin cannot read or modify Organization B", async () => {
    const a = await createOrg("Alpha");
    const b = await createOrg("Beta");
    await signInAs(a.admin.id);

    const campuses = await call<{ id: string }[]>(listCampuses);
    expect(campuses.data.map((c) => c.id)).toEqual([a.campus.id]);

    const users = await call<{ rows: { id: string }[] }>(listUsers);
    expect(users.data.rows.map((u) => u.id)).not.toContain(b.admin.id);

    const patch = await call(updateCampus, {
      method: "PATCH",
      params: { id: b.campus.id },
      body: { name: "Taken over", code: "TKO" },
    });
    expect(patch.status).toBe(404);

    const del = await call(archiveCampus, { method: "DELETE", params: { id: b.campus.id } });
    expect(del.status).toBe(404);

    const disable = await call(updateUser, { method: "PATCH", params: { id: b.admin.id }, body: { status: "DISABLED" } });
    expect(disable.status).toBe(404);

    const role = await call(updateRole, {
      method: "PATCH",
      params: { id: b.roles.teacher },
      body: { name: "Teacher", description: null, permissions: ["dashboard.view"] },
    });
    expect(role.status).toBe(404);

    // Granting a role from another organization is refused.
    const assign = await call(updateUser, {
      method: "PATCH",
      params: { id: a.admin.id },
      body: { roles: [{ roleId: a.roles.admin, campusId: null }, { roleId: b.roles.admin, campusId: null }] },
    });
    expect(assign.status).toBe(404);

    // Switching into another organization's campus is refused.
    const sw = await call(switchCampus, { method: "PUT", body: { campusId: b.campus.id } });
    expect(sw.status).toBe(404);

    const bStill = await db.user.findUniqueOrThrow({ where: { id: b.admin.id } });
    expect(bStill.status).toBe("ACTIVE");
  });

  it("rejects requests with no session", async () => {
    const res = await call(listCampuses);
    expect(res.status).toBe(401);
  });
});

describe("role-based access", () => {
  it("teachers cannot manage users, campuses or roles", async () => {
    const org = await createOrg();
    const teacher = await createUser({ organizationId: org.org.id, roles: org.roles }, "teacher");
    await signInAs(teacher.id);

    expect((await call(listUsers)).status).toBe(403);
    expect((await call(createCampus, { body: { name: "New", code: "NEW" } })).status).toBe(403);
    expect((await call(invite, { body: { email: "x@y.test", roleId: org.roles.admin } })).status).toBe(403);
  });

  it("prevents privilege escalation: a principal cannot grant the administrator role", async () => {
    const org = await createOrg();
    const principal = await createUser({ organizationId: org.org.id, roles: org.roles }, "principal");
    const teacher = await createUser({ organizationId: org.org.id, roles: org.roles }, "teacher");
    await signInAs(principal.id);

    const promote = await call(updateUser, { method: "PATCH", params: { id: teacher.id }, body: { roles: [{ roleId: org.roles.admin, campusId: null }] } });
    expect(promote.status).toBe(403);
    const self = await call(updateUser, { method: "PATCH", params: { id: principal.id }, body: { roles: [{ roleId: org.roles.admin, campusId: null }] } });
    expect(self.status).toBe(403);
    const inviteAdmin = await call(invite, { body: { email: `boss-${Date.now()}@test.local`, roleId: org.roles.admin } });
    expect(inviteAdmin.status).toBe(403);

    // But can manage roles within their own access.
    const ok = await call(updateUser, { method: "PATCH", params: { id: teacher.id }, body: { roles: [{ roleId: org.roles.accountant, campusId: null }] } });
    expect(ok.status).toBe(200);
  });

  it("always keeps at least one active administrator", async () => {
    const org = await createOrg();
    await signInAs(org.admin.id);
    const demote = await call(updateUser, { method: "PATCH", params: { id: org.admin.id }, body: { roles: [{ roleId: org.roles.teacher, campusId: null }] } });
    expect(demote.status).toBe(400);
    const disableSelf = await call(updateUser, { method: "PATCH", params: { id: org.admin.id }, body: { status: "DISABLED" } });
    expect(disableSelf.status).toBe(400);
    const lockOut = await call(updateRole, {
      method: "PATCH",
      params: { id: org.roles.admin },
      body: { name: "Administrator", description: null, permissions: ["dashboard.view"] },
    });
    expect(lockOut.status).toBe(400);
  });

  it("campus-restricted users only see and switch to their campus", async () => {
    const org = await createOrg();
    await signInAs(org.admin.id);
    const second = await call<{ id: string }>(createCampus, { body: { name: "North Campus", code: "NTH" } });
    expect(second.status).toBe(201);

    const teacher = await createUser({ organizationId: org.org.id, roles: org.roles }, "teacher", { campusId: second.data.id });
    await signInAs(teacher.id);
    const who = await call<{ campusId: string | null }>(me);
    expect(who.data.campusId).toBe(second.data.id);

    const toMain = await call(switchCampus, { method: "PUT", body: { campusId: org.campus.id } });
    expect(toMain.status).toBe(403);
    const toAll = await call(switchCampus, { method: "PUT", body: { campusId: null } });
    expect(toAll.status).toBe(403);
  });
});

describe("invitations", () => {
  it("invites a user who accepts once and gets exactly the invited role", async () => {
    const org = await createOrg();
    await signInAs(org.admin.id);
    const email = `new-teacher-${Date.now()}@test.local`;
    const sent = await call<{ id: string }>(invite, { body: { email, roleId: org.roles.teacher, campusId: org.campus.id } });
    expect(sent.status).toBe(201);

    // Recreate a known token for the test (the real one only exists in the email).
    const token = `invite-token-${crypto.randomUUID()}`;
    await db.invitation.update({ where: { id: sent.data.id }, data: { tokenHash: hashToken(token) } });

    signOut();
    const body = { token, firstName: "Sara", lastName: "Malik", password: "TeachPass123", confirmPassword: "TeachPass123" };
    const accepted = await call(acceptInvite, { body });
    expect(accepted.status).toBe(200);

    const user = await db.user.findUniqueOrThrow({ where: { email }, include: { roles: { include: { role: true } } } });
    expect(user.organizationId).toBe(org.org.id);
    expect(user.roles.map((r) => [r.role.key, r.campusId])).toEqual([["teacher", org.campus.id]]);

    const again = await call(acceptInvite, { body });
    expect(again.status).toBe(400);
  });

  it("refuses to invite an email that already has an account", async () => {
    const a = await createOrg("Alpha");
    const b = await createOrg("Beta");
    await signInAs(a.admin.id);
    const res = await call(invite, { body: { email: b.admin.email, roleId: a.roles.teacher } });
    expect(res.status).toBe(409);
  });

  it("revoked invitations can't be accepted", async () => {
    const org = await createOrg();
    await signInAs(org.admin.id);
    const sent = await call<{ id: string }>(invite, { body: { email: `revoked-${Date.now()}@test.local`, roleId: org.roles.teacher } });
    const token = `invite-token-${crypto.randomUUID()}`;
    await db.invitation.update({ where: { id: sent.data.id }, data: { tokenHash: hashToken(token) } });
    expect((await call(revokeInvite, { method: "DELETE", params: { id: sent.data.id } })).status).toBe(200);
    signOut();
    const res = await call(acceptInvite, { body: { token, firstName: "A", lastName: "B", password: "Password1234", confirmPassword: "Password1234" } });
    expect(res.status).toBe(400);
  });
});

describe("plan limits", () => {
  it("blocks adding campuses beyond the plan and explains why", async () => {
    const org = await createOrg();
    const starter = await db.plan.findUniqueOrThrow({ where: { key: "starter" } });
    await db.subscription.update({ where: { organizationId: org.org.id }, data: { planId: starter.id } });
    await signInAs(org.admin.id);
    const res = await call(createCampus, { body: { name: "Second", code: "SEC" } });
    expect(res.status).toBe(402);
    expect(res.error?.code).toBe("PLAN_LIMIT_REACHED");
    expect(res.error?.message).toMatch(/Starter plan includes up to 1 campus/);
  });

  it("makes suspended organizations read-only", async () => {
    const org = await createOrg();
    await db.subscription.update({ where: { organizationId: org.org.id }, data: { status: "SUSPENDED" } });
    await signInAs(org.admin.id);
    expect((await call(listCampuses)).status).toBe(200);
    const write = await call(createCampus, { body: { name: "Second", code: "SEC" } });
    expect(write.status).toBe(402);
    expect(write.error?.code).toBe("SUBSCRIPTION_INACTIVE");
  });
});
