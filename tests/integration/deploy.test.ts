import { describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { syncSystemRoles } from "@/server/modules/organizations/provision";
import { GET as health } from "@/app/api/health/route";
import { createOrg } from "../support/fixtures";

describe("deploy-time permission sync", () => {
  it("grants permissions introduced by an upgrade, but never re-adds ones a school removed", async () => {
    const s = await createOrg("Upgrade");
    const teacherRole = await db.role.findFirstOrThrow({ where: { organizationId: s.org.id, key: "teacher" } });
    const perm = (key: string) => db.permission.findUniqueOrThrow({ where: { key } });
    const has = async (key: string) => {
      const p = await db.permission.findUnique({ where: { key } });
      return !!p && (await db.rolePermission.count({ where: { roleId: teacherRole.id, permissionId: p.id } })) > 0;
    };

    // The school deliberately took "marks.enter" away from teachers.
    await db.rolePermission.delete({ where: { roleId_permissionId: { roleId: teacherRole.id, permissionId: (await perm("marks.enter")).id } } });
    // Simulate an upgrade that introduces "support.use" (it didn't exist before this deploy).
    await db.permission.delete({ where: { key: "support.use" } });
    expect(await has("support.use")).toBe(false);

    const r = await syncSystemRoles();
    expect(r.introduced).toEqual(["support.use"]);
    expect(await has("support.use")).toBe(true);
    expect(await has("marks.enter")).toBe(false);
    // Running again changes nothing.
    expect((await syncSystemRoles()).introduced).toEqual([]);
  });
});

describe("health endpoint", () => {
  it("reports a healthy database without exposing details", async () => {
    const res = await health();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toMatchObject({ status: "ok", checks: { database: "ok" } });
    expect(JSON.stringify(body)).not.toMatch(/postgres|password|DATABASE_URL/i);
  });
});
