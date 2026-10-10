import { describe, expect, it } from "vitest";
import { ALL_PERMISSIONS, groupPermissionsByModule, SYSTEM_ROLES } from "@/lib/permissions";
import { filterNav, STAFF_NAV } from "@/components/shell/nav-config";

describe("permission catalog", () => {
  it("uses module.action keys", () => {
    for (const key of ALL_PERMISSIONS) expect(key).toMatch(/^[a-z_]+\.[a-z_]+$/);
  });

  it("only grants known permissions to system roles", () => {
    const known = new Set(ALL_PERMISSIONS);
    for (const role of Object.values(SYSTEM_ROLES)) for (const p of role.permissions) expect(known.has(p)).toBe(true);
  });

  it("keeps sensitive capabilities away from the wrong roles", () => {
    expect(SYSTEM_ROLES.teacher.permissions).not.toContain("fees.manage");
    expect(SYSTEM_ROLES.teacher.permissions).not.toContain("records.all");
    expect(SYSTEM_ROLES.accountant.permissions).not.toContain("results.publish");
    expect(SYSTEM_ROLES.accountant.permissions).not.toContain("marks.enter");
    expect(SYSTEM_ROLES.parent.permissions).not.toContain("students.view");
    expect(SYSTEM_ROLES.student.permissions).not.toContain("students.view");
    expect(SYSTEM_ROLES.principal.permissions).not.toContain("billing.manage");
  });

  it("groups every permission exactly once", () => {
    const grouped = groupPermissionsByModule().flatMap((g) => g.permissions.map((p) => p.key));
    expect(grouped.sort()).toEqual([...ALL_PERMISSIONS].sort());
  });
});

describe("navigation filtering", () => {
  it("hides finance from teachers", () => {
    const nav = filterNav(STAFF_NAV, new Set(SYSTEM_ROLES.teacher.permissions));
    expect(nav.map((n) => n.key)).not.toContain("finance");
    expect(nav.map((n) => n.key)).toContain("attendance");
  });

  it("drops groups whose children are all hidden", () => {
    const nav = filterNav(STAFF_NAV, new Set(["dashboard.view"]));
    expect(nav.map((n) => n.key)).toEqual(["dashboard"]);
  });
});
