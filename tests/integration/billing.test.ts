import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/server/db/client";
import { GET as billing } from "@/app/api/billing/route";
import { POST as requestPlan } from "@/app/api/billing/request/route";
import { POST as cancel } from "@/app/api/billing/cancel/route";
import { GET as myTicket, POST as replyTicket } from "@/app/api/support/[id]/route";
import { POST as openTicket } from "@/app/api/support/route";
import { PUT as updateSub } from "@/app/api/admin/organizations/[id]/subscription/route";
import { POST as issueInvoice } from "@/app/api/admin/organizations/[id]/invoices/route";
import { POST as invoiceAction } from "@/app/api/admin/invoices/[id]/route";
import { POST as savePlan } from "@/app/api/admin/plans/route";
import { POST as staffReply } from "@/app/api/admin/support/[id]/route";
import { POST as createClass } from "@/app/api/classes/route";
import { subscriptionLifecycle } from "@/server/jobs/tasks/billing";
import { testPasswordHash } from "../support/fixtures";
import { call, createOrg, createUser, signInAs, signOut } from "../support/fixtures";

beforeEach(async () => {
  signOut();
  await db.rateLimit.deleteMany();
});

async function superAdmin() {
  return db.user.create({ data: { email: `staff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@eduattend.test`, passwordHash: await testPasswordHash(), firstName: "Platform", lastName: "Staff", isSuperAdmin: true } });
}
const dateStr = (offsetDays: number) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

describe("school billing", () => {
  it("shows plan, usage and plans; only billing roles can see it", async () => {
    const s = await createOrg("Billing");
    await signInAs(s.admin.id);
    const res = await call<{ subscription: { status: string }; usage: { key: string }[]; plans: unknown[] }>(billing);
    expect(res.status).toBe(200);
    expect(res.data.subscription.status).toBe("TRIALING");
    expect(res.data.usage.map((u) => u.key)).toContain("students");
    expect(res.data.plans.length).toBeGreaterThan(0);

    const teacher = await createUser({ organizationId: s.org.id, roles: s.roles }, "teacher");
    await signInAs(teacher.id);
    expect((await call(billing)).status).toBe(403);
    expect((await call(requestPlan, { body: { planKey: "professional", billingCycle: "MONTHLY" } })).status).toBe(403);
  });

  it("turns plan changes into one support request, and keeps working while read-only", async () => {
    const s = await createOrg("Upgrade");
    await signInAs(s.admin.id);
    await db.subscription.update({ where: { organizationId: s.org.id }, data: { status: "SUSPENDED" } });
    // Regular writes are blocked…
    expect((await call(createClass, { body: { name: "Grade 1", level: 1, campusId: s.campus.id, sections: ["A"] } })).status).toBe(402);
    // …but asking for a plan is not.
    const req = await call<{ id: string; number: number }>(requestPlan, { body: { planKey: "professional", billingCycle: "YEARLY", note: "Two campuses" } });
    expect(req.status).toBe(201);
    const ticket = await db.supportTicket.findUniqueOrThrow({ where: { id: req.data.id }, include: { messages: true } });
    expect(ticket.category).toBe("billing");
    expect(ticket.messages[0]!.body).toContain("Two campuses");
    expect((await call(requestPlan, { body: { planKey: "business", billingCycle: "MONTHLY" } })).status).toBe(400);
    // Nothing to cancel on a suspended account.
    expect((await call(cancel, { body: { cancel: true } })).status).toBe(400);
  });
});

describe("platform billing", () => {
  it("is for platform staff only", async () => {
    const s = await createOrg("Guarded");
    await signInAs(s.admin.id);
    expect((await call(issueInvoice, { params: { id: s.org.id }, body: { amount: 1000, periodStart: dateStr(0), periodEnd: dateStr(30), dueAt: dateStr(7) } })).status).toBe(403);
    expect((await call(savePlan, { body: { key: "hack", name: "Hack", description: "Free stuff", priceMonthly: 0, priceYearly: 0, currency: "PKR", trialDays: 0, limits: {}, features: [], isPublic: true, isCustom: false, highlighted: false, sortOrder: 0 } })).status).toBe(403);
    const plan = await db.plan.findFirstOrThrow({ where: { key: "business" } });
    expect((await call(updateSub, { method: "PUT", params: { id: s.org.id }, body: { planId: plan.id, status: "ACTIVE", billingCycle: "YEARLY", currentPeriodEnd: dateStr(365), reason: "self-upgrade" } })).status).toBe(403);
  });

  it("a paid invoice is the way from past-due to active", async () => {
    const s = await createOrg("Paying");
    await db.subscription.update({ where: { organizationId: s.org.id }, data: { status: "PAST_DUE", trialEndsAt: new Date(Date.now() - 86_400_000) } });
    const staff = await superAdmin();
    await signInAs(staff.id);
    const inv = await call<{ id: string; number: string }>(issueInvoice, { params: { id: s.org.id }, body: { amount: 49990, periodStart: dateStr(0), periodEnd: dateStr(365), dueAt: dateStr(7) } });
    expect(inv.status).toBe(201);
    expect(inv.data.number).toMatch(/^EA-/);
    expect((await call(invoiceAction, { params: { id: inv.data.id }, body: { action: "paid", paidAt: dateStr(0), note: "Bank ref 123" } })).status).toBe(200);
    const sub = await db.subscription.findUniqueOrThrow({ where: { organizationId: s.org.id } });
    expect(sub.status).toBe("ACTIVE");
    expect(sub.trialEndsAt).toBeNull();
    expect(sub.currentPeriodEnd.toISOString().slice(0, 10)).toBe(dateStr(365));
    // Paying twice is refused.
    expect((await call(invoiceAction, { params: { id: inv.data.id }, body: { action: "paid", paidAt: dateStr(0), note: "again" } })).status).toBe(409);
    expect(await db.auditLog.count({ where: { organizationId: s.org.id, action: "platform.invoice_paid" } })).toBe(1);
  });

  it("custom limits override the plan for one school", async () => {
    const s = await createOrg("Custom");
    const staff = await superAdmin();
    await signInAs(staff.id);
    const plan = await db.plan.findFirstOrThrow({ where: { key: "starter" } });
    const res = await call(updateSub, { method: "PUT", params: { id: s.org.id }, body: { planId: plan.id, status: "ACTIVE", billingCycle: "MONTHLY", currentPeriodEnd: dateStr(30), customLimits: { students: 5000, campuses: null }, reason: "Agreed on call" } });
    expect(res.status).toBe(200);
    await signInAs(s.admin.id);
    const b = await call<{ usage: { key: string; limit: number | null }[] }>(billing);
    expect(b.data.usage.find((u) => u.key === "students")!.limit).toBe(5000);
    expect(b.data.usage.find((u) => u.key === "campuses")!.limit).toBeNull();
    expect(b.data.usage.find((u) => u.key === "teachers")!.limit).toBe((plan.limits as { teachers: number }).teachers);
  });

  it("the daily job ends trials into grace, then makes the account read-only", async () => {
    const s = await createOrg("Lifecycle");
    await db.subscription.update({ where: { organizationId: s.org.id }, data: { trialEndsAt: new Date(Date.now() - 3_600_000), currentPeriodEnd: new Date(Date.now() - 3_600_000) } });
    await subscriptionLifecycle.run(new Date());
    expect((await db.subscription.findUniqueOrThrow({ where: { organizationId: s.org.id } })).status).toBe("PAST_DUE");
    await subscriptionLifecycle.run(new Date(Date.now() + 30 * 86_400_000));
    expect((await db.subscription.findUniqueOrThrow({ where: { organizationId: s.org.id } })).status).toBe("SUSPENDED");
    expect(await db.notification.count({ where: { userId: s.admin.id, type: "system" } })).toBeGreaterThanOrEqual(2);
  });
});

describe("support", () => {
  it("schools never see internal notes or other schools' tickets", async () => {
    const a = await createOrg("Alpha");
    await signInAs(a.admin.id);
    const t = await call<{ id: string }>(openTicket, { body: { subject: "Import fails", category: "data", priority: "HIGH", body: "The student import stops at row 40." } });
    expect(t.status).toBe(201);

    const staff = await superAdmin();
    await signInAs(staff.id);
    await call(staffReply, { params: { id: t.data.id }, body: { body: "Customer is on an old file format.", internal: true } });
    await call(staffReply, { params: { id: t.data.id }, body: { body: "Please send the file as .xlsx", internal: false } });

    await signInAs(a.admin.id);
    const thread = await call<{ messages: { body: string; fromSupport: boolean }[]; status: string }>(myTicket, { params: { id: t.data.id } });
    expect(thread.data.messages.map((m) => m.body)).toEqual(["The student import stops at row 40.", "Please send the file as .xlsx"]);
    expect(thread.data.status).toBe("WAITING_ON_CUSTOMER");
    expect(await db.notification.count({ where: { userId: a.admin.id, title: { contains: "Support replied" } } })).toBe(1);
    // Replying puts it back in the queue.
    await call(replyTicket, { params: { id: t.data.id }, body: { body: "Done, sent." } });
    expect((await db.supportTicket.findUniqueOrThrow({ where: { id: t.data.id } })).status).toBe("OPEN");

    const b = await createOrg("Beta");
    await signInAs(b.admin.id);
    expect((await call(myTicket, { params: { id: t.data.id } })).status).toBe(404);
    expect((await call(replyTicket, { params: { id: t.data.id }, body: { body: "hi" } })).status).toBe(404);
  });
});
