import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { GET as listDocs } from "@/app/api/documents/route";
import { GET as checklist, POST as setupAction } from "@/app/api/onboarding/route";
import { POST as createClass } from "@/app/api/classes/route";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

type Docs = { total: number; rows: { title: string }[] };

describe("documents", () => {
  it("the library never exposes students' private files, and 'all files' needs full access", async () => {
    const s = await createOrg("Docs");
    const o = s.org.id;
    const student = await db.student.create({ data: { organizationId: o, campusId: s.campus.id, admissionNo: `D-${Date.now()}`, firstName: "Ali", lastName: "Test" } });
    const doc = (title: string, extra: Record<string, unknown>) => db.document.create({ data: { organizationId: o, title, fileName: `${title}.pdf`, mimeType: "application/pdf", sizeBytes: 10, storageKey: `test/${title}-${Date.now()}`, checksum: "test", category: "GENERAL", ...extra } });
    await doc("Uniform policy", {});
    await doc("Ali B-Form", { category: "STUDENT", entityType: "student", entityId: student.id });

    const teacher = await createUser({ organizationId: o, roles: s.roles }, "teacher");
    await signInAs(teacher.id);
    const lib = await call<Docs>(listDocs);
    expect(lib.data.rows.map((r) => r.title)).toEqual(["Uniform policy"]);
    expect((await call(listDocs, { query: { scope: "all" } })).status).toBe(403);
    // Teachers who don't teach Ali can't open his files directly either.
    expect((await call(listDocs, { query: { entityType: "student", entityId: student.id } })).status).toBe(404);

    await signInAs(s.admin.id);
    const all = await call<Docs>(listDocs, { query: { scope: "all" } });
    expect(all.data.rows.map((r) => r.title).sort()).toEqual(["Ali B-Form", "Uniform policy"]);
  });
});

describe("setup guide", () => {
  it("ticks steps off from real data and can be finished", async () => {
    const s = await createOrg("Setup");
    await signInAs(s.admin.id);
    type C = { steps: { key: string; done: boolean }[]; done: number; total: number; completedAt: string | null };
    const before = await call<C>(checklist);
    expect(before.data.steps.find((x) => x.key === "classes")!.done).toBe(false);
    await call(createClass, { body: { name: "Grade 1", level: 1, campusId: s.campus.id, sections: ["A"] } });
    const after = await call<C>(checklist);
    expect(after.data.steps.find((x) => x.key === "classes")!.done).toBe(true);
    expect(after.data.done).toBe(before.data.done + 1);

    expect((await call(setupAction, { body: { action: "complete" } })).status).toBe(200);
    expect((await db.organization.findUniqueOrThrow({ where: { id: s.org.id } })).onboardingCompletedAt).not.toBeNull();

    const teacher = await createUser({ organizationId: s.org.id, roles: s.roles }, "teacher");
    await signInAs(teacher.id);
    expect((await call(checklist)).status).toBe(403);
  });
});
