import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as login } from "@/app/api/auth/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { POST as forgot } from "@/app/api/auth/forgot-password/route";
import { POST as reset } from "@/app/api/auth/reset-password/route";
import { GET as me } from "@/app/api/auth/me/route";
import { hashToken } from "@/server/auth/crypto";
import { testCookies } from "../support/integration-env";
import { call, createOrg, signOut } from "../support/fixtures";

const uniqueEmail = () => `owner-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@school.test`;

beforeEach(async () => {
  signOut();
  // Rate-limit buckets would otherwise leak between tests.
  await db.rateLimit.deleteMany();
});

describe("registration", () => {
  it("creates a complete tenant: organization, campus, roles, admin and trial", async () => {
    const email = uniqueEmail();
    const res = await call(register, {
      body: { firstName: "Ahmed", lastName: "Raza", email, password: "SecurePass123", organizationName: "Iqra Model School", country: "PK" },
    });
    expect(res.status).toBe(201);
    expect(res.data).toEqual({ redirectTo: "/onboarding" });

    const user = await db.user.findUniqueOrThrow({ where: { email }, include: { roles: { include: { role: true } } } });
    expect(user.passwordHash).not.toContain("SecurePass123");
    expect(user.roles.map((r) => r.role.key)).toEqual(["admin"]);

    const org = await db.organization.findUniqueOrThrow({
      where: { id: user.organizationId! },
      include: { campuses: true, roles: true, subscription: true },
    });
    expect(org.currency).toBe("PKR");
    expect(org.timezone).toBe("Asia/Karachi");
    expect(org.campuses).toHaveLength(1);
    expect(org.roles.map((r) => r.key).sort()).toEqual(["accountant", "admin", "parent", "principal", "staff", "student", "teacher"]);
    expect(org.subscription?.status).toBe("TRIALING");
    expect(testCookies.get("ea_session")).toBeTruthy();
  });

  it("rejects a duplicate email with a field error", async () => {
    const email = uniqueEmail();
    const body = { firstName: "A", lastName: "B", email, password: "SecurePass123", organizationName: "First School", country: "PK" };
    await call(register, { body });
    signOut();
    const res = await call(register, { body: { ...body, organizationName: "Second School" } });
    expect(res.status).toBe(409);
    expect(res.error?.fields?.email).toMatch(/already exists/);
  });

  it("validates weak passwords", async () => {
    const res = await call(register, {
      body: { firstName: "A", lastName: "B", email: uniqueEmail(), password: "short", organizationName: "School", country: "PK" },
    });
    expect(res.status).toBe(422);
    expect(res.error?.fields?.password).toBeTruthy();
  });
});

describe("login & sessions", () => {
  it("signs in, exposes the session, and signs out", async () => {
    const { admin } = await createOrg();
    const res = await call(login, { body: { email: admin.email, password: "Password123!", remember: false } });
    expect(res.status).toBe(200);
    expect(res.data).toEqual({ redirectTo: "/dashboard" });

    const who = await call<{ user: { id: string }; permissions: string[] }>(me);
    expect(who.data.user.id).toBe(admin.id);
    expect(who.data.permissions).toContain("billing.manage");

    await call(logout, { body: {} });
    expect(testCookies.get("ea_session")).toBeUndefined();
    const after = await call(me);
    expect(after.status).toBe(401);
  });

  it("uses one generic message for unknown emails and wrong passwords", async () => {
    const { admin } = await createOrg();
    const wrong = await call(login, { body: { email: admin.email, password: "nope-nope-1" } });
    const unknown = await call(login, { body: { email: "nobody@nowhere.test", password: "nope-nope-1" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.error?.message).toBe(unknown.error?.message);
  });

  it("rate-limits repeated failed logins", async () => {
    const { admin } = await createOrg();
    let last = 0;
    for (let i = 0; i < 10; i++) {
      last = (await call(login, { body: { email: admin.email, password: `wrong-pass-${i}` } })).status;
    }
    expect(last).toBe(429);
  });

  it("never throttles successful sign-ins (a whole school may share one IP)", async () => {
    const { admin } = await createOrg();
    for (let i = 0; i < 25; i++) {
      const res = await call(login, { body: { email: admin.email, password: "Password123!" } });
      expect(res.status).toBe(200);
    }
  });

  it("clears an account's failure count after a successful sign-in", async () => {
    const { admin } = await createOrg();
    for (let i = 0; i < 6; i++) await call(login, { body: { email: admin.email, password: `wrong-pass-${i}` } });
    expect((await call(login, { body: { email: admin.email, password: "Password123!" } })).status).toBe(200);
    for (let i = 0; i < 6; i++) {
      expect((await call(login, { body: { email: admin.email, password: `wrong-again-${i}` } })).status).toBe(401);
    }
  });

  it("blocks disabled users", async () => {
    const { admin } = await createOrg();
    await db.user.update({ where: { id: admin.id }, data: { status: "DISABLED" } });
    const res = await call(login, { body: { email: admin.email, password: "Password123!" } });
    expect(res.status).toBe(403);
  });

  it("rejects cross-site state-changing requests", async () => {
    const { NextRequest } = await import("next/server");
    const req = new NextRequest("http://localhost:3000/api/auth/login", {
      method: "POST",
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      body: JSON.stringify({ email: "a@b.c", password: "x" }),
    });
    const res = await login(req, { params: Promise.resolve({}) });
    expect(res.status).toBe(403);
  });
});

describe("password reset", () => {
  it("resets the password with a valid token, revokes sessions, and burns the token", async () => {
    const { admin } = await createOrg();
    await call(login, { body: { email: admin.email, password: "Password123!" } });
    expect(await db.session.count({ where: { userId: admin.id } })).toBe(1);

    const res = await call(forgot, { body: { email: admin.email } });
    expect(res.status).toBe(200);

    // The raw token only exists in the email; recreate a known one for the test.
    const token = `known-reset-token-${crypto.randomUUID()}`;
    await db.passwordResetToken.create({ data: { userId: admin.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000) } });

    const done = await call(reset, { body: { token, password: "BrandNewPass99", confirmPassword: "BrandNewPass99" } });
    expect(done.status).toBe(200);
    expect(await db.session.count({ where: { userId: admin.id } })).toBe(0);

    const reuse = await call(reset, { body: { token, password: "AnotherPass99", confirmPassword: "AnotherPass99" } });
    expect(reuse.status).toBe(400);

    const relogin = await call(login, { body: { email: admin.email, password: "BrandNewPass99" } });
    expect(relogin.status).toBe(200);
  });

  it("does not reveal whether an email exists", async () => {
    const res = await call(forgot, { body: { email: "missing@nowhere.test" } });
    expect(res.status).toBe(200);
    expect(await db.passwordResetToken.count({ where: { user: { email: "missing@nowhere.test" } } })).toBe(0);
  });
});
