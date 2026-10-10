import "server-only";
import type { z } from "zod";
import { auditFor } from "@/server/audit";
import type { TenantContext } from "@/server/auth/context";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { badRequest, notFound } from "@/server/http/errors";
import { notifyUsers } from "@/server/modules/communication/notifications";
import { createTicket } from "@/server/modules/support/tickets";
import type { cancelSchema, planChangeRequestSchema } from "@/lib/validation/billing";
import type { PlanLimits } from "./catalog";
import { currentUsage, getEffectiveLimits, type LimitMetric } from "./limits";

const METRICS: { key: LimitMetric; label: string; unit?: string }[] = [
  { key: "students", label: "Active students" },
  { key: "teachers", label: "Teachers" },
  { key: "staff", label: "Staff members" },
  { key: "campuses", label: "Campuses" },
  { key: "storageMb", label: "Document storage", unit: "MB" },
  { key: "notificationsPerMonth", label: "Messages this month" },
];

/** Everything on Settings → Billing: plan, usage against limits, invoices and the plan catalog. */
export async function billingOverview(ctx: TenantContext) {
  const sub = await ctx.db.subscription.findFirst({ include: { plan: true } });
  const effective = await getEffectiveLimits(ctx.orgId);
  const [usage, invoices, plans, openRequest] = await Promise.all([
    Promise.all(METRICS.map(async (m) => ({ ...m, used: await currentUsage(ctx.orgId, m.key), limit: effective?.limits[m.key] ?? null }))),
    ctx.db.billingInvoice.findMany({ orderBy: { issuedAt: "desc" }, take: 24 }),
    db.plan.findMany({ where: { isPublic: true }, orderBy: { sortOrder: "asc" } }),
    ctx.db.supportTicket.findFirst({ where: { category: "billing", status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } }, orderBy: { createdAt: "desc" }, select: { id: true, number: true, subject: true, createdAt: true } }),
  ]);
  const now = Date.now();
  return {
    subscription: sub && {
      status: sub.status,
      planId: sub.planId,
      planKey: sub.plan.key,
      planName: sub.plan.name,
      billingCycle: sub.billingCycle,
      price: sub.customPrice !== null ? Number(sub.customPrice) : Number(sub.billingCycle === "YEARLY" ? sub.plan.priceYearly : sub.plan.priceMonthly),
      currency: sub.plan.currency,
      trialEndsAt: sub.trialEndsAt?.toISOString() ?? null,
      trialDaysLeft: sub.status === "TRIALING" && sub.trialEndsAt ? Math.max(0, Math.ceil((sub.trialEndsAt.getTime() - now) / 86_400_000)) : null,
      currentPeriodEnd: sub.currentPeriodEnd.toISOString(),
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      custom: sub.customLimits !== null || sub.customPrice !== null,
    },
    usage,
    invoices: invoices.map((i) => ({ id: i.id, number: i.number, amount: Number(i.amount), currency: i.currency, periodStart: i.periodStart.toISOString(), periodEnd: i.periodEnd.toISOString(), status: i.status as string, issuedAt: i.issuedAt.toISOString(), dueAt: i.dueAt.toISOString(), paidAt: i.paidAt?.toISOString() ?? null, overdue: i.status === "OPEN" && i.dueAt.getTime() < now })),
    plans: plans.map((p) => ({ id: p.id, key: p.key, name: p.name, description: p.description, priceMonthly: Number(p.priceMonthly), priceYearly: Number(p.priceYearly), currency: p.currency, limits: p.limits as PlanLimits, features: p.features, highlighted: p.highlighted, isCustom: p.isCustom })),
    openRequest: openRequest && { id: openRequest.id, number: openRequest.number, subject: openRequest.subject, createdAt: openRequest.createdAt.toISOString() },
    paymentInstructions: env.BILLING_PAYMENT_INSTRUCTIONS ?? null,
    contactEmail: env.BILLING_CONTACT_EMAIL ?? null,
  };
}

/**
 * Plan changes are handled by people, not a card form: the request becomes a
 * billing ticket, the EduAttend team confirms the price and sends an invoice.
 */
export async function requestPlanChange(ctx: TenantContext, input: z.output<typeof planChangeRequestSchema>) {
  const plan = await db.plan.findFirst({ where: { key: input.planKey, isPublic: true } });
  if (!plan) throw notFound("Plan");
  const sub = await ctx.db.subscription.findFirst({ include: { plan: true } });
  if (sub && sub.planId === plan.id && sub.billingCycle === input.billingCycle && sub.status === "ACTIVE") throw badRequest("You're already on this plan.");
  const open = await ctx.db.supportTicket.findFirst({ where: { category: "billing", status: { in: ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] } } });
  if (open) throw badRequest(`You already have a billing request open (#${open.number}). We'll reply there.`);

  // Usage that wouldn't fit the requested plan is flagged up front.
  const over: string[] = [];
  for (const m of METRICS) {
    const cap = (plan.limits as PlanLimits)[m.key];
    if (cap !== null && cap !== undefined) {
      const used = await currentUsage(ctx.orgId, m.key);
      if (used > cap) over.push(`${m.label}: using ${used.toLocaleString()}, plan allows ${cap.toLocaleString()}`);
    }
  }
  const price = input.billingCycle === "YEARLY" ? Number(plan.priceYearly) : Number(plan.priceMonthly);
  const ticket = await createTicket(ctx, {
    subject: `Plan change: ${plan.name} (${input.billingCycle === "YEARLY" ? "yearly" : "monthly"})`,
    category: "billing",
    priority: "MEDIUM",
    body: [
      `Please move us to the ${plan.name} plan, billed ${input.billingCycle === "YEARLY" ? "yearly" : "monthly"} (${plan.currency} ${price.toLocaleString()}).`,
      sub ? `Current plan: ${sub.plan.name} (${sub.status.toLowerCase()}).` : null,
      over.length ? `Note — current usage exceeds this plan:\n${over.map((o) => `• ${o}`).join("\n")}` : null,
      input.note ? `Notes: ${input.note}` : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
  });
  await auditFor(ctx)({ action: "billing.plan_change_requested", entityType: "subscription", metadata: { plan: plan.key, cycle: input.billingCycle, ticket: ticket.number } });
  return { ticket, over };
}

export async function setCancelAtPeriodEnd(ctx: TenantContext, input: z.output<typeof cancelSchema>) {
  const sub = await ctx.db.subscription.findFirst();
  if (!sub) throw notFound("Subscription");
  if (input.cancel && sub.status === "TRIALING") throw badRequest("You're on a free trial — it simply ends on its own. Nothing to cancel.");
  if (input.cancel && sub.status !== "ACTIVE" && sub.status !== "PAST_DUE") throw badRequest("There's no running subscription to cancel.");
  await ctx.db.subscription.update({ where: { id: sub.id }, data: { cancelAtPeriodEnd: input.cancel, canceledAt: input.cancel ? new Date() : null } });
  await auditFor(ctx)({ action: input.cancel ? "billing.cancel_scheduled" : "billing.cancel_reverted", entityType: "subscription", entityId: sub.id, metadata: { reason: input.reason } });
  const admins = await db.user.findMany({ where: { isSuperAdmin: true, deletedAt: null }, select: { id: true } });
  await notifyUsers(
    null,
    admins.map((a) => ({
      userId: a.id,
      type: "system",
      title: input.cancel ? `${ctx.organization.name} scheduled cancellation` : `${ctx.organization.name} kept their subscription`,
      body: input.cancel ? `Ends ${sub.currentPeriodEnd.toISOString().slice(0, 10)}.${input.reason ? ` Reason: ${input.reason}` : ""}` : "Cancellation was withdrawn.",
      link: `/admin/organizations/${ctx.orgId}`,
    })),
  );
}

/** A billing invoice for the school's own records (print view). */
export async function myBillingInvoice(ctx: TenantContext, id: string) {
  const inv = await ctx.db.billingInvoice.findFirst({ where: { id }, include: { subscription: { include: { plan: { select: { name: true } } } } } });
  if (!inv) throw notFound("Invoice");
  const org = await db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { name: true, address: true, email: true, phone: true } });
  return { invoice: inv, org, instructions: env.BILLING_PAYMENT_INSTRUCTIONS ?? null };
}
