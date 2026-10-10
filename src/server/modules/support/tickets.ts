import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { audit, auditFor } from "@/server/audit";
import type { TenantContext } from "@/server/auth/context";
import { db } from "@/server/db/client";
import { nextSequence } from "@/server/db/sequence";
import { badRequest, notFound } from "@/server/http/errors";
import { notifyUsers, usersWithPermission } from "@/server/modules/communication/notifications";
import type { ticketReplySchema, ticketSchema, ticketUpdateSchema } from "@/lib/validation/billing";

const OPEN_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_ON_CUSTOMER"] as const;

async function names(ids: string[]) {
  const users = ids.length ? await db.user.findMany({ where: { id: { in: [...new Set(ids)] } }, select: { id: true, firstName: true, lastName: true, isSuperAdmin: true } }) : [];
  return new Map(users.map((u) => [u.id, { name: `${u.firstName} ${u.lastName}`, staff: u.isSuperAdmin }]));
}

async function notifyPlatform(title: string, body: string, link: string) {
  const admins = await db.user.findMany({ where: { isSuperAdmin: true, deletedAt: null }, select: { id: true } });
  await notifyUsers(null, admins.map((a) => ({ userId: a.id, type: "system", title, body, link })));
}

// ── School side ──

export async function listMyTickets(ctx: TenantContext, status?: "open" | "closed") {
  const rows = await ctx.db.supportTicket.findMany({
    where: status === "closed" ? { status: { in: ["RESOLVED", "CLOSED"] } } : status === "open" ? { status: { in: [...OPEN_STATUSES] } } : {},
    orderBy: { updatedAt: "desc" },
    take: 100,
    include: { _count: { select: { messages: { where: { isInternal: false } } } } },
  });
  return rows.map((t) => ({ id: t.id, number: t.number, subject: t.subject, category: t.category, priority: t.priority as string, status: t.status as string, messages: t._count.messages, updatedAt: t.updatedAt.toISOString(), createdAt: t.createdAt.toISOString() }));
}

export async function createTicket(ctx: TenantContext, input: z.output<typeof ticketSchema>) {
  const number = await nextSequence(ctx.orgId, "support_ticket");
  const ticket = await ctx.db.supportTicket.create({
    data: {
      organizationId: ctx.orgId,
      number,
      createdById: ctx.user.id,
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      messages: { create: { organizationId: ctx.orgId, authorId: ctx.user.id, body: input.body } },
    },
  });
  await auditFor(ctx)({ action: "support.ticket_create", entityType: "support_ticket", entityId: ticket.id, metadata: { number, category: input.category } });
  await notifyPlatform(`New ${input.category} ticket from ${ctx.organization.name}`, input.subject, `/admin/support/${ticket.id}`);
  return { id: ticket.id, number };
}

/** A ticket thread as the school sees it — internal staff notes are never included. */
export async function getMyTicket(ctx: TenantContext, id: string) {
  const t = await ctx.db.supportTicket.findFirst({ where: { id }, include: { messages: { where: { isInternal: false }, orderBy: { createdAt: "asc" } } } });
  if (!t) throw notFound("Ticket");
  const who = await names([t.createdById, ...t.messages.map((m) => m.authorId)]);
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    category: t.category,
    priority: t.priority as string,
    status: t.status as string,
    createdAt: t.createdAt.toISOString(),
    messages: t.messages.map((m) => ({ id: m.id, body: m.body, createdAt: m.createdAt.toISOString(), author: who.get(m.authorId)?.name ?? "Former user", fromSupport: who.get(m.authorId)?.staff ?? false })),
  };
}

export async function replyMyTicket(ctx: TenantContext, id: string, body: string) {
  const t = await ctx.db.supportTicket.findFirst({ where: { id } });
  if (!t) throw notFound("Ticket");
  if (t.status === "CLOSED") throw badRequest("This ticket is closed. Open a new one if you still need help.");
  await ctx.db.$transaction([
    ctx.db.supportTicketMessage.create({ data: { organizationId: ctx.orgId, ticketId: id, authorId: ctx.user.id, body } }),
    // A customer reply moves it back into the support queue.
    ctx.db.supportTicket.update({ where: { id }, data: { status: t.status === "WAITING_ON_CUSTOMER" || t.status === "RESOLVED" ? "OPEN" : t.status, resolvedAt: null } }),
  ]);
  await notifyPlatform(`Reply on #${t.number} from ${ctx.organization.name}`, body.slice(0, 200), `/admin/support/${id}`);
}

export async function closeMyTicket(ctx: TenantContext, id: string) {
  const t = await ctx.db.supportTicket.findFirst({ where: { id } });
  if (!t) throw notFound("Ticket");
  await ctx.db.supportTicket.update({ where: { id }, data: { status: "CLOSED", resolvedAt: t.resolvedAt ?? new Date() } });
  await auditFor(ctx)({ action: "support.ticket_close", entityType: "support_ticket", entityId: id });
}

// ── Platform side (super admins) ──

export async function listAllTickets(p: { status?: string; q?: string; page: number; pageSize: number }) {
  const where: Prisma.SupportTicketWhereInput = {
    ...(p.status === "closed" ? { status: { in: ["RESOLVED", "CLOSED"] } } : p.status === "all" ? {} : { status: { in: [...OPEN_STATUSES] } }),
    ...(p.q ? { OR: [{ subject: { contains: p.q, mode: "insensitive" } }, { organization: { name: { contains: p.q, mode: "insensitive" } } }] } : {}),
  };
  const [rows, total] = await Promise.all([
    db.supportTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: { organization: { select: { id: true, name: true } }, messages: { orderBy: { createdAt: "desc" }, take: 1, select: { authorId: true, createdAt: true } } },
    }),
    db.supportTicket.count({ where }),
  ]);
  const who = await names(rows.flatMap((r) => r.messages.map((m) => m.authorId)));
  const rank = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 } as Record<string, number>;
  return {
    total,
    rows: rows
      .map((t) => {
        const last = t.messages[0];
        return {
          id: t.id,
          number: t.number,
          subject: t.subject,
          category: t.category,
          priority: t.priority as string,
          status: t.status as string,
          organization: t.organization,
          updatedAt: t.updatedAt.toISOString(),
          // Waiting on us when the latest message came from the school.
          awaitingSupport: !!last && !(who.get(last.authorId)?.staff ?? false) && t.status !== "CLOSED" && t.status !== "RESOLVED",
        };
      })
      .sort((a, b) => Number(b.awaitingSupport) - Number(a.awaitingSupport) || rank[a.priority]! - rank[b.priority]!),
  };
}

export async function getTicketForStaff(id: string) {
  const t = await db.supportTicket.findUnique({ where: { id }, include: { organization: { select: { id: true, name: true, slug: true } }, messages: { orderBy: { createdAt: "asc" } } } });
  if (!t) throw notFound("Ticket");
  const who = await names([t.createdById, ...t.messages.map((m) => m.authorId)]);
  return {
    id: t.id,
    number: t.number,
    subject: t.subject,
    category: t.category,
    priority: t.priority as string,
    status: t.status as string,
    organization: t.organization,
    openedBy: who.get(t.createdById)?.name ?? "Former user",
    createdAt: t.createdAt.toISOString(),
    messages: t.messages.map((m) => ({ id: m.id, body: m.body, internal: m.isInternal, createdAt: m.createdAt.toISOString(), author: who.get(m.authorId)?.name ?? "Former user", fromSupport: who.get(m.authorId)?.staff ?? false })),
  };
}

export async function staffReply(staffUserId: string, id: string, input: z.output<typeof ticketReplySchema>) {
  const t = await db.supportTicket.findUnique({ where: { id } });
  if (!t) throw notFound("Ticket");
  await db.$transaction([
    db.supportTicketMessage.create({ data: { organizationId: t.organizationId, ticketId: id, authorId: staffUserId, body: input.body, isInternal: input.internal } }),
    ...(input.internal ? [] : [db.supportTicket.update({ where: { id }, data: { status: t.status === "OPEN" ? "WAITING_ON_CUSTOMER" : t.status, assigneeId: t.assigneeId ?? staffUserId } })]),
  ]);
  if (!input.internal) {
    // The person who opened it plus the school's billing/settings admins hear about the reply.
    const admins = await usersWithPermission(t.organizationId, [t.category === "billing" ? "billing.manage" : "settings.manage"]);
    const recipients = [...new Set([t.createdById, ...admins])];
    await notifyUsers(t.organizationId, recipients.map((userId) => ({ userId, type: "system", title: `Support replied to #${t.number}`, body: input.body.slice(0, 200), link: `/support/${id}`, dedupeKey: null })));
  }
  await audit({ organizationId: t.organizationId, userId: staffUserId, action: input.internal ? "support.note" : "support.reply", entityType: "support_ticket", entityId: id });
}

export async function staffUpdateTicket(staffUserId: string, id: string, input: z.output<typeof ticketUpdateSchema>) {
  const t = await db.supportTicket.findUnique({ where: { id } });
  if (!t) throw notFound("Ticket");
  await db.supportTicket.update({
    where: { id },
    data: { ...input, ...(input.status === "RESOLVED" || input.status === "CLOSED" ? { resolvedAt: new Date() } : input.status ? { resolvedAt: null } : {}) },
  });
  await audit({ organizationId: t.organizationId, userId: staffUserId, action: "support.update", entityType: "support_ticket", entityId: id, before: { status: t.status, priority: t.priority }, after: input });
}
