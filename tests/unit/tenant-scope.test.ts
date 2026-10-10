import { describe, expect, it } from "vitest";
import { scopeArgs, TenantViolationError } from "@/server/db/tenant";

const ORG = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("tenant scoping", () => {
  it("adds organizationId to every read", () => {
    for (const op of ["findMany", "findFirst", "findUnique", "count", "aggregate", "groupBy"]) {
      const args = scopeArgs("Student", op, { where: { firstName: "Ali" } }, ORG);
      expect(args.where).toEqual({ firstName: "Ali", organizationId: ORG });
    }
  });

  it("overrides a caller-supplied organizationId in where clauses", () => {
    const args = scopeArgs("Student", "findMany", { where: { organizationId: OTHER } }, ORG);
    expect(args.where?.organizationId).toBe(ORG);
  });

  it("scopes updates and deletes", () => {
    expect(scopeArgs("Invoice", "update", { where: { id: "x" }, data: { notes: "n" } }, ORG).where).toEqual({ id: "x", organizationId: ORG });
    expect(scopeArgs("Invoice", "deleteMany", { where: {} }, ORG).where).toEqual({ organizationId: ORG });
  });

  it("refuses to move a record into another organization", () => {
    expect(() => scopeArgs("Student", "update", { where: { id: "x" }, data: { organizationId: OTHER } }, ORG)).toThrow(TenantViolationError);
  });

  it("stamps organizationId on creates", () => {
    expect(scopeArgs("Student", "create", { data: { firstName: "Ali" } }, ORG).data).toEqual({ firstName: "Ali", organizationId: ORG });
    const many = scopeArgs("Student", "createMany", { data: [{ firstName: "A" }, { firstName: "B" }] }, ORG);
    expect(many.data).toEqual([
      { firstName: "A", organizationId: ORG },
      { firstName: "B", organizationId: ORG },
    ]);
  });

  it("rejects creates targeting another organization", () => {
    expect(() => scopeArgs("Student", "create", { data: { organizationId: OTHER } }, ORG)).toThrow(TenantViolationError);
    expect(() => scopeArgs("Student", "createMany", { data: [{ organizationId: OTHER }] }, ORG)).toThrow(TenantViolationError);
  });

  it("scopes upserts on both lookup and insert", () => {
    const args = scopeArgs("Mark", "upsert", { where: { id: "m" }, create: { studentId: "s" }, update: {} }, ORG);
    expect(args.where).toEqual({ id: "m", organizationId: ORG });
    expect(args.create).toEqual({ studentId: "s", organizationId: ORG });
  });

  it("pins Organization lookups to the tenant and blocks other operations", () => {
    expect(scopeArgs("Organization", "findUnique", { where: { id: OTHER } }, ORG).where).toEqual({ id: ORG });
    expect(() => scopeArgs("Organization", "create", { data: {} }, ORG)).toThrow(TenantViolationError);
  });

  it("leaves platform models untouched", () => {
    expect(scopeArgs("Plan", "findMany", { where: { isPublic: true } }, ORG).where).toEqual({ isPublic: true });
  });
});
