import { db } from "@/server/db/client";
import type { DemoContext } from "./demo";
import { SUPER_ADMIN } from "./platform";

/**
 * The demo school's yearly invoice (paid by bank transfer) and a short support
 * conversation, so billing and support screens show real records.
 */
export async function seedBilling(ctx: DemoContext) {
  const orgId = ctx.orgId;
  if ((await db.billingInvoice.count({ where: { organizationId: orgId } })) > 0) return;
  const sub = await db.subscription.findUnique({ where: { organizationId: orgId }, include: { plan: true } });
  const org = await db.organization.findUniqueOrThrow({ where: { id: orgId }, select: { slug: true } });
  const staff = await db.user.findUnique({ where: { email: SUPER_ADMIN.email } });
  if (!sub || !staff) return;

  const day = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
  const price = sub.billingCycle === "YEARLY" ? Number(sub.plan.priceYearly) : Number(sub.plan.priceMonthly);
  await db.billingInvoice.create({
    data: {
      organizationId: orgId,
      subscriptionId: sub.id,
      number: `EA-${org.slug.toUpperCase()}-0001`,
      amount: price,
      currency: sub.plan.currency,
      periodStart: sub.currentPeriodStart,
      periodEnd: sub.currentPeriodEnd,
      issuedAt: day(sub.currentPeriodStart, -7),
      dueAt: sub.currentPeriodStart,
      status: "PAID",
      paidAt: day(sub.currentPeriodStart, -2),
      paymentNote: "Bank transfer · Meezan Bank ref MZN-48213",
    },
  });
  await db.$executeRaw`
    INSERT INTO "sequences" ("organizationId", "key", "value") VALUES (${orgId}::uuid, 'billing_invoice', 1), (${orgId}::uuid, 'support_ticket', 1)
    ON CONFLICT ("organizationId", "key") DO UPDATE SET "value" = GREATEST("sequences"."value", EXCLUDED."value")`;

  const admin = ctx.users.admin!;
  const opened = day(new Date(), -3);
  const ticket = await db.supportTicket.create({
    data: { organizationId: orgId, number: 1, createdById: admin, subject: "WhatsApp absence alerts for our second campus", category: "technical", priority: "MEDIUM", status: "WAITING_ON_CUSTOMER", assigneeId: staff.id, createdAt: opened },
  });
  await db.supportTicketMessage.createMany({
    data: [
      { organizationId: orgId, ticketId: ticket.id, authorId: admin, createdAt: opened, body: "We'd like parents at our Rawalpindi campus to get absence alerts on WhatsApp too. Do we need a separate WhatsApp number for each campus?" },
      { organizationId: orgId, ticketId: ticket.id, authorId: staff.id, createdAt: day(opened, 0.2), isInternal: true, body: "One number per organization is enough. Check they've approved the absence template in Meta." },
      { organizationId: orgId, ticketId: ticket.id, authorId: staff.id, createdAt: day(opened, 0.25), body: "No — one WhatsApp Business number covers all your campuses. Once it's connected under Settings → Notifications, alerts go to parents at both campuses. Could you confirm the absence message template has been approved in your Meta Business Manager?" },
    ],
  });
  console.log("  billing: 1 invoice, 1 support ticket");
}
