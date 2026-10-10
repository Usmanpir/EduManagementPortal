import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { audit } from "@/server/audit";
import { db } from "@/server/db/client";
import { nextSequence } from "@/server/db/sequence";
import { badRequest, conflict, notFound } from "@/server/http/errors";
import { currentUsage, getEffectiveLimits, type LimitMetric } from "@/server/modules/billing/limits";
import type { PlanLimits } from "@/server/modules/billing/catalog";
import { notifyUsers, usersWithPermission } from "@/server/modules/communication/notifications";
import { dateOnly } from "@/lib/format";
import type { billingInvoiceSchema, markPaidSchema, orgStatusSchema, planSchema, subscriptionUpdateSchema } from "@/lib/validation/billing";

const METRICS: LimitMetric[] = ["students", "teachers", "staff", "campuses", "storageMb", "notificationsPerMonth", "apiRequestsPerDay"];

async function tellSchoolAdmins(organizationId: string, title: string, body: string) {
  const ids = await usersWithPermission(organizationId, ["billing.view"]);
  await notifyUsers(organizationId, ids.map((userId) => ({ userId, type: "system", title, body, link: "/settings/billing" })));
}

export async function organizationDetail(id: string) {
  const org = await db.organization.findFirst({
    where: { id, deletedAt: null },
    include: {
      subscription: { include: { plan: true } },
      campuses: { where: { deletedAt: null }, select: { id: true, name: true, code: true } },
    },
  });
  if (!org) throw notFound("Organization");
  const effective = await getEffectiveLimits(id);
  const [usage, invoices, tickets, admins, activity] = await Promise.all([
    Promise.all(METRICS.map(async (m) => ({ key: m, used: await currentUsage(id, m), limit: effective?.limits[m] ?? null }))),
    db.billingInvoice.findMany({ where: { organizationId: id }, orderBy: { issuedAt: "desc" }, take: 50 }),
    db.supportTicket.findMany({ where: { organizationId: id }, orderBy: { updatedAt: "desc" }, take: 10, select: { id: true, number: true, subject: true, status: true, priority: true, updatedAt: true } }),
    db.user.findMany({ where: { organizationId: id, deletedAt: null, roles: { some: { role: { key: "admin" } } } }, select: { id: true, firstName: true, lastName: true, email: true, lastLoginAt: true } }),
    db.auditLog.findMany({ where: { organizationId: id, action: { startsWith: "platform." } }, orderBy: { createdAt: "desc" }, take: 15, select: { id: true, action: true, metadata: true, createdAt: true, userId: true } }),
  ]);
  const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true, key: true, isPublic: true, isCustom: true, priceMonthly: true, priceYearly: true, currency: true, limits: true } });
  const s = org.subscription;
  return {
    org: { id: org.id, name: org.name, slug: org.slug, email: org.email, phone: org.phone, country: org.country, status: org.status, createdAt: org.createdAt.toISOString(), campuses: org.campuses },
    subscription: s && {
      id: s.id,
      planId: s.planId,
      planName: s.plan.name,
      status: s.status as string,
      billingCycle: s.billingCycle as string,
      trialEndsAt: s.trialEndsAt?.toISOString().slice(0, 10) ?? null,
      currentPeriodStart: s.currentPeriodStart.toISOString().slice(0, 10),
      currentPeriodEnd: s.currentPeriodEnd.toISOString().slice(0, 10),
      cancelAtPeriodEnd: s.cancelAtPeriodEnd,
      customPrice: s.customPrice !== null ? Number(s.customPrice) : null,
      customLimits: (s.customLimits as Partial<PlanLimits> | null) ?? null,
      listPrice: Number(s.billingCycle === "YEARLY" ? s.plan.priceYearly : s.plan.priceMonthly),
      currency: s.plan.currency,
    },
    usage,
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, amount: Number(i.amount), currency: i.currency, periodStart: i.periodStart.toISOString().slice(0, 10), periodEnd: i.periodEnd.toISOString().slice(0, 10), dueAt: i.dueAt.toISOString().slice(0, 10), status: i.status as string, paidAt: i.paidAt?.toISOString().slice(0, 10) ?? null, paymentNote: i.paymentNote })),
    tickets: tickets.map((t) => ({ ...t, status: t.status as string, priority: t.priority as string, updatedAt: t.updatedAt.toISOString() })),
    admins: admins.map((a) => ({ id: a.id, name: `${a.firstName} ${a.lastName}`, email: a.email, lastLoginAt: a.lastLoginAt?.toISOString() ?? null })),
    activity: activity.map((a) => ({ id: a.id, action: a.action, metadata: a.metadata as Record<string, unknown> | null, createdAt: a.createdAt.toISOString() })),
    plans: plans.map((p) => ({ id: p.id, name: p.name, key: p.key, isPublic: p.isPublic, isCustom: p.isCustom, priceMonthly: Number(p.priceMonthly), priceYearly: Number(p.priceYearly), currency: p.currency, limits: p.limits as PlanLimits })),
  };
}

export async function updateSubscription(adminId: string, organizationId: string, input: z.output<typeof subscriptionUpdateSchema>) {
  const sub = await db.subscription.findUnique({ where: { organizationId } });
  if (!sub) throw notFound("Subscription");
  const plan = await db.plan.findUnique({ where: { id: input.planId } });
  if (!plan) throw notFound("Plan");
  if (input.status === "TRIALING" && !input.trialEndsAt) throw badRequest("Set when the trial ends.", { trialEndsAt: "Required for a trial." });
  const customLimits = input.customLimits && Object.keys(input.customLimits).length ? (input.customLimits as Prisma.InputJsonValue) : Prisma.DbNull;
  const after = await db.subscription.update({
    where: { id: sub.id },
    data: {
      planId: plan.id,
      status: input.status,
      billingCycle: input.billingCycle,
      trialEndsAt: input.trialEndsAt ? dateOnly(input.trialEndsAt) : null,
      currentPeriodEnd: dateOnly(input.currentPeriodEnd),
      customPrice: input.customPrice,
      customLimits,
      ...(input.status === "CANCELED" ? { canceledAt: sub.canceledAt ?? new Date() } : input.status === "ACTIVE" ? { canceledAt: null, cancelAtPeriodEnd: false } : {}),
    },
  });
  await audit({ organizationId, userId: adminId, action: "platform.subscription_update", entityType: "subscription", entityId: sub.id, before: sub, after, metadata: { reason: input.reason } });
  if (sub.status !== input.status || sub.planId !== plan.id) {
    await tellSchoolAdmins(organizationId, "Your subscription was updated", `Plan: ${plan.name} · status: ${input.status.toLowerCase().replace("_", " ")}.`);
  }
}

export async function setOrganizationStatus(adminId: string, organizationId: string, input: z.output<typeof orgStatusSchema>) {
  const org = await db.organization.findFirst({ where: { id: organizationId, deletedAt: null } });
  if (!org) throw notFound("Organization");
  if (org.status === input.status) return;
  await db.organization.update({ where: { id: organizationId }, data: { status: input.status } });
  await audit({ organizationId, userId: adminId, action: input.status === "SUSPENDED" ? "platform.org_suspend" : "platform.org_reactivate", entityType: "organization", entityId: organizationId, metadata: { reason: input.reason } });
}

/** Issues a manual invoice (paid by bank transfer); numbers are unique per platform. */
export async function createBillingInvoice(adminId: string, organizationId: string, input: z.output<typeof billingInvoiceSchema>) {
  const org = await db.organization.findFirst({ where: { id: organizationId, deletedAt: null }, include: { subscription: { include: { plan: true } } } });
  if (!org?.subscription) throw notFound("Subscription");
  const n = await nextSequence(organizationId, "billing_invoice");
  const invoice = await db.billingInvoice.create({
    data: {
      organizationId,
      subscriptionId: org.subscription.id,
      number: `EA-${org.slug.toUpperCase()}-${String(n).padStart(4, "0")}`,
      amount: input.amount,
      currency: org.subscription.plan.currency,
      periodStart: dateOnly(input.periodStart),
      periodEnd: dateOnly(input.periodEnd),
      dueAt: dateOnly(input.dueAt),
    },
  });
  await audit({ organizationId, userId: adminId, action: "platform.invoice_create", entityType: "billing_invoice", entityId: invoice.id, metadata: { number: invoice.number, amount: input.amount } });
  await tellSchoolAdmins(organizationId, `New EduAttend invoice ${invoice.number}`, `${invoice.currency} ${input.amount.toLocaleString()} due ${input.dueAt}.`);
  return invoice;
}

/**
 * Records money actually received. Paying an invoice activates the
 * subscription for the invoice's period — the only way a school becomes "paid".
 */
export async function markBillingInvoicePaid(adminId: string, invoiceId: string, input: z.output<typeof markPaidSchema>) {
  const inv = await db.billingInvoice.findUnique({ where: { id: invoiceId }, include: { subscription: true } });
  if (!inv) throw notFound("Invoice");
  if (inv.status !== "OPEN") throw conflict(`This invoice is already ${inv.status.toLowerCase()}.`);
  await db.$transaction([
    db.billingInvoice.update({ where: { id: invoiceId }, data: { status: "PAID", paidAt: dateOnly(input.paidAt), paymentNote: input.note } }),
    db.subscription.update({
      where: { id: inv.subscriptionId },
      data: {
        status: "ACTIVE",
        trialEndsAt: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
        currentPeriodStart: inv.periodStart < inv.subscription.currentPeriodStart || inv.subscription.status !== "ACTIVE" ? inv.periodStart : inv.subscription.currentPeriodStart,
        currentPeriodEnd: inv.periodEnd > inv.subscription.currentPeriodEnd || inv.subscription.status !== "ACTIVE" ? inv.periodEnd : inv.subscription.currentPeriodEnd,
      },
    }),
  ]);
  await audit({ organizationId: inv.organizationId, userId: adminId, action: "platform.invoice_paid", entityType: "billing_invoice", entityId: invoiceId, metadata: { number: inv.number, note: input.note } });
  await tellSchoolAdmins(inv.organizationId, `Payment received for ${inv.number}`, "Thank you — your subscription is active.");
}

export async function voidBillingInvoice(adminId: string, invoiceId: string, reason: string) {
  const inv = await db.billingInvoice.findUnique({ where: { id: invoiceId } });
  if (!inv) throw notFound("Invoice");
  if (inv.status !== "OPEN") throw conflict("Only open invoices can be voided.");
  await db.billingInvoice.update({ where: { id: invoiceId }, data: { status: "VOID", paymentNote: `Voided: ${reason}` } });
  await audit({ organizationId: inv.organizationId, userId: adminId, action: "platform.invoice_void", entityType: "billing_invoice", entityId: invoiceId, metadata: { reason } });
}

// ── Plans ──

export async function listPlansForAdmin() {
  const plans = await db.plan.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { subscriptions: true } } } });
  return plans.map((p) => ({ id: p.id, key: p.key, name: p.name, description: p.description, priceMonthly: Number(p.priceMonthly), priceYearly: Number(p.priceYearly), currency: p.currency, trialDays: p.trialDays, limits: p.limits as PlanLimits, features: p.features, isPublic: p.isPublic, isCustom: p.isCustom, highlighted: p.highlighted, sortOrder: p.sortOrder, subscribers: p._count.subscriptions }));
}

export async function savePlan(adminId: string, id: string | null, input: z.output<typeof planSchema>) {
  const clash = await db.plan.findFirst({ where: { key: input.key, ...(id ? { id: { not: id } } : {}) } });
  if (clash) throw badRequest("Another plan uses this key.", { key: "Already used." });
  const data = { ...input, limits: input.limits as Prisma.InputJsonValue };
  const before = id ? await db.plan.findUnique({ where: { id } }) : null;
  if (id && !before) throw notFound("Plan");
  // Only one plan carries the "Most popular" highlight.
  const plan = await db.$transaction(async (tx) => {
    if (input.highlighted) await tx.plan.updateMany({ where: { highlighted: true, ...(id ? { id: { not: id } } : {}) }, data: { highlighted: false } });
    return id ? tx.plan.update({ where: { id }, data }) : tx.plan.create({ data });
  });
  await audit({ organizationId: null, userId: adminId, action: id ? "platform.plan_update" : "platform.plan_create", entityType: "plan", entityId: plan.id, before, after: plan });
  return plan;
}
