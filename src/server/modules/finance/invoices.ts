import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { campusScope, type TenantContext } from "@/server/auth/context";
import { nextSequence } from "@/server/db/sequence";
import { badRequest, notFound } from "@/server/http/errors";
import { accessibleSectionIds } from "@/server/modules/academics/scope";
import { findAccessibleStudent } from "@/server/modules/people/students";
import { dateOnly, todayIn, toDateString } from "@/lib/format";
import type { generateInvoicesSchema, invoiceSchema } from "@/lib/validation/finance";
import { isOptIn } from "./fees";
import { discountCents, fromCents, invoiceStatus, toCents, type InvoiceStatusValue } from "./money";
import { nameMatch } from "@/server/db/search";

type Tx = Parameters<Parameters<TenantContext["db"]["$transaction"]>[0]>[0];

export async function nextInvoiceNo(ctx: TenantContext, issueDate: string) {
  const n = await nextSequence(ctx.orgId, "invoice");
  return `${ctx.settings.finance.invoicePrefix || "INV"}-${issueDate.slice(0, 4)}-${String(n).padStart(5, "0")}`;
}

export async function nextReceiptNo(ctx: TenantContext) {
  const n = await nextSequence(ctx.orgId, "receipt");
  return `${ctx.settings.finance.receiptPrefix || "RCP"}-${String(n).padStart(6, "0")}`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const periodLabel = (p: string) => `${MONTHS[Number(p.slice(5, 7)) - 1]} ${p.slice(0, 4)}`;

/**
 * Bills every active student (optionally one class) for the chosen fees and month.
 * Idempotent: a student already invoiced for the month is skipped (DB-enforced).
 */
export async function generateInvoices(ctx: TenantContext, input: z.output<typeof generateInvoicesSchema>) {
  if (input.dueDate < input.issueDate) throw badRequest("The due date can't be before the issue date.", { dueDate: "Before the issue date." });
  const structures = await ctx.db.feeStructure.findMany({ where: { id: { in: input.feeStructureIds }, isActive: true } });
  if (structures.length !== input.feeStructureIds.length) throw notFound("Fee");

  const students = await ctx.db.student.findMany({
    where: { status: "ACTIVE", archivedAt: null, ...campusScope(ctx), ...(input.classId ? { classId: input.classId } : {}) },
    select: { id: true, campusId: true, classId: true, firstName: true, lastName: true, fees: true, invoices: { where: { billingPeriod: input.billingPeriod }, select: { id: true } } },
  });

  let created = 0;
  let skipped = 0;
  let empty = 0;
  for (const s of students) {
    if (s.invoices.length) {
      skipped++;
      continue;
    }
    const items = structures
      .filter((f) => (f.classId === null || f.classId === s.classId) && (f.campusId === null || f.campusId === s.campusId))
      .flatMap((f) => {
        const assignment = s.fees.find((a) => a.feeStructureId === f.id);
        const applies = assignment ? assignment.isActive : !isOptIn(f.category);
        if (!applies) return [];
        const amount = toCents(f.amount);
        const discount = assignment ? discountCents(amount, assignment.discountType, Number(assignment.discountValue)) : 0;
        return [{ feeStructureId: f.id, description: f.name, category: f.category, amount, discount }];
      });
    if (items.length === 0) {
      empty++;
      continue;
    }
    const subtotal = items.reduce((n, i) => n + i.amount, 0);
    const discount = items.reduce((n, i) => n + i.discount, 0);
    const invoiceNo = await nextInvoiceNo(ctx, input.issueDate);
    try {
      await ctx.db.invoice.create({
        data: {
          organizationId: ctx.orgId,
          campusId: s.campusId,
          studentId: s.id,
          invoiceNo,
          billingPeriod: input.billingPeriod,
          title: `Fees — ${periodLabel(input.billingPeriod)}`,
          issueDate: dateOnly(input.issueDate),
          dueDate: dateOnly(input.dueDate),
          subtotal: fromCents(subtotal),
          discount: fromCents(discount),
          total: fromCents(subtotal - discount),
          status: subtotal - discount <= 0 ? "PAID" : "PENDING",
          createdById: ctx.user.id,
          items: {
            create: items.map((i) => ({ organizationId: ctx.orgId, feeStructureId: i.feeStructureId, description: i.description, category: i.category, amount: fromCents(i.amount), discount: fromCents(i.discount), total: fromCents(i.amount - i.discount) })),
          },
        },
      });
      created++;
    } catch (error) {
      // A concurrent run already billed this student for the month.
      if (error instanceof Error && "code" in error && (error as { code: string }).code === "P2002") skipped++;
      else throw error;
    }
  }
  await auditFor(ctx)({ action: "invoice.generate", entityType: "invoice", metadata: { ...input, created, skipped, empty } });
  return { created, skipped, empty };
}

export async function createInvoice(ctx: TenantContext, input: z.output<typeof invoiceSchema>) {
  const student = await findAccessibleStudent(ctx, input.studentId);
  if (!student || student.archivedAt) throw notFound("Student");
  if (input.dueDate < input.issueDate) throw badRequest("The due date can't be before the issue date.", { dueDate: "Before the issue date." });
  const items = input.items.map((i) => {
    const amount = toCents(i.amount);
    const discount = Math.min(amount, toCents(i.discount));
    return { ...i, amount, discount };
  });
  const subtotal = items.reduce((n, i) => n + i.amount, 0);
  const discount = items.reduce((n, i) => n + i.discount, 0);
  const invoice = await ctx.db.invoice.create({
    data: {
      organizationId: ctx.orgId,
      campusId: student.campusId,
      studentId: student.id,
      invoiceNo: await nextInvoiceNo(ctx, input.issueDate),
      title: input.title,
      issueDate: dateOnly(input.issueDate),
      dueDate: dateOnly(input.dueDate),
      notes: input.notes,
      subtotal: fromCents(subtotal),
      discount: fromCents(discount),
      total: fromCents(subtotal - discount),
      status: invoiceStatus(subtotal - discount, 0, input.dueDate, todayIn(ctx.organization.timezone)),
      createdById: ctx.user.id,
      items: { create: items.map((i) => ({ organizationId: ctx.orgId, description: i.description, category: i.category, amount: fromCents(i.amount), discount: fromCents(i.discount), total: fromCents(i.amount - i.discount) })) },
    },
  });
  await auditFor(ctx)({ action: "invoice.create", entityType: "invoice", entityId: invoice.id, after: input });
  return invoice;
}

export type InvoiceListParams = { q?: string; studentId?: string; status?: string[]; classId?: string[]; period?: string; page: number; pageSize: number; sort?: string; dir?: "asc" | "desc" };

async function invoiceScope(ctx: TenantContext): Promise<Prisma.InvoiceWhereInput> {
  const sections = await accessibleSectionIds(ctx);
  return { ...campusScope(ctx), ...(sections ? { student: { sectionId: { in: sections } } } : {}) };
}

export async function listInvoices(ctx: TenantContext, p: InvoiceListParams) {
  const where: Prisma.InvoiceWhereInput = {
    AND: [
      await invoiceScope(ctx),
      p.status?.length ? { status: { in: p.status as InvoiceStatusValue[] } } : p.studentId ? {} : { status: { not: "CANCELLED" } },
      p.studentId ? { studentId: p.studentId } : {},
      p.classId?.length ? { student: { classId: { in: p.classId } } } : {},
      p.period ? { billingPeriod: p.period } : {},
      p.q
        ? {
            OR: [
              { invoiceNo: { contains: p.q, mode: "insensitive" } },
              { student: nameMatch(p.q) },
              { student: { admissionNo: { contains: p.q, mode: "insensitive" } } },
            ],
          }
        : {},
    ],
  };
  const dir = p.dir ?? "desc";
  const orderBy: Prisma.InvoiceOrderByWithRelationInput[] =
    p.sort === "due" ? [{ dueDate: dir }] : p.sort === "amount" ? [{ total: dir }] : p.sort === "student" ? [{ student: { firstName: dir } }] : [{ issueDate: "desc" }, { invoiceNo: "desc" }];
  const [rows, total, sums] = await Promise.all([
    ctx.db.invoice.findMany({
      where,
      orderBy,
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, class: { select: { name: true } }, section: { select: { name: true } } } } },
    }),
    ctx.db.invoice.count({ where }),
    ctx.db.invoice.aggregate({ where, _sum: { total: true, amountPaid: true } }),
  ]);
  return {
    total,
    totals: { billed: Number(sums._sum.total ?? 0), collected: Number(sums._sum.amountPaid ?? 0) },
    rows: rows.map((i) => ({
      id: i.id,
      invoiceNo: i.invoiceNo,
      title: i.title,
      studentId: i.student.id,
      student: `${i.student.firstName} ${i.student.lastName}`,
      admissionNo: i.student.admissionNo,
      className: i.student.class ? `${i.student.class.name}${i.student.section ? `-${i.student.section.name}` : ""}` : null,
      issueDate: toDateString(i.issueDate),
      dueDate: toDateString(i.dueDate),
      total: Number(i.total),
      paid: Number(i.amountPaid),
      balance: Number(i.total) - Number(i.amountPaid),
      status: i.status,
    })),
  };
}

const docInclude = {
  items: { orderBy: { category: "asc" } },
  payments: { orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }] },
  student: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      admissionNo: true,
      rollNumber: true,
      campus: { select: { name: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
      guardians: { where: { isPrimary: true }, take: 1, select: { guardian: { select: { firstName: true, lastName: true, phone: true, email: true } } } },
    },
  },
} satisfies Prisma.InvoiceInclude;

/** Plain, serializable invoices (with items & payments) for screens and print. */
export async function invoiceDocuments(ctx: TenantContext, ids: string[], opts: { authorized?: boolean } = {}) {
  // `authorized`: the caller already checked ownership (family portal). Tenant scoping still applies via ctx.db.
  const rows = await ctx.db.invoice.findMany({ where: { AND: [{ id: { in: ids } }, opts.authorized ? {} : await invoiceScope(ctx)] }, include: docInclude, orderBy: [{ student: { firstName: "asc" } }, { invoiceNo: "asc" }] });
  const receiverIds = [...new Set(rows.flatMap((r) => r.payments.map((p) => p.receivedById)).filter((x): x is string => !!x))];
  const receivers = receiverIds.length ? await ctx.db.user.findMany({ where: { id: { in: receiverIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const names = new Map(receivers.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  return rows.map((i) => {
    const g = i.student.guardians[0]?.guardian;
    return {
      id: i.id,
      invoiceNo: i.invoiceNo,
      title: i.title,
      billingPeriod: i.billingPeriod,
      issueDate: toDateString(i.issueDate),
      dueDate: toDateString(i.dueDate),
      status: i.status as InvoiceStatusValue,
      subtotal: Number(i.subtotal),
      discount: Number(i.discount),
      fine: Number(i.fine),
      total: Number(i.total),
      paid: Number(i.amountPaid),
      balance: Number(i.total) - Number(i.amountPaid),
      notes: i.notes,
      cancelledAt: i.cancelledAt?.toISOString() ?? null,
      student: {
        id: i.student.id,
        name: `${i.student.firstName} ${i.student.lastName}`,
        admissionNo: i.student.admissionNo,
        rollNumber: i.student.rollNumber,
        campus: i.student.campus.name,
        className: i.student.class ? `${i.student.class.name}${i.student.section ? `-${i.student.section.name}` : ""}` : null,
        guardian: g ? { name: `${g.firstName} ${g.lastName}`, phone: g.phone, email: g.email } : null,
      },
      items: i.items.map((it) => ({ id: it.id, description: it.description, category: it.category as string, amount: Number(it.amount), discount: Number(it.discount), total: Number(it.total) })),
      payments: i.payments.map((p) => ({
        id: p.id,
        receiptNo: p.receiptNo,
        amount: Number(p.amount),
        method: p.method as string,
        reference: p.reference,
        paidAt: toDateString(p.paidAt),
        status: p.status as string,
        voidReason: p.voidReason,
        receivedBy: p.receivedById ? (names.get(p.receivedById) ?? "Former user") : null,
      })),
    };
  });
}

export type InvoiceDocument = Awaited<ReturnType<typeof invoiceDocuments>>[number];

export async function getInvoice(ctx: TenantContext, id: string) {
  const [doc] = await invoiceDocuments(ctx, [id]);
  return doc ?? null;
}

export async function cancelInvoice(ctx: TenantContext, id: string, reason: string) {
  const invoice = await ctx.db.invoice.findFirst({ where: { AND: [{ id }, await invoiceScope(ctx)] }, include: { payments: { where: { status: "COMPLETED" } } } });
  if (!invoice) throw notFound("Invoice");
  if (invoice.status === "CANCELLED") return;
  if (invoice.payments.length) throw badRequest("This invoice has payments. Void the payments first, then cancel it.");
  await ctx.db.invoice.update({ where: { id }, data: { status: "CANCELLED", cancelledAt: new Date(), notes: [invoice.notes, `Cancelled: ${reason}`].filter(Boolean).join("\n") } });
  await auditFor(ctx)({ action: "invoice.cancel", entityType: "invoice", entityId: id, before: { status: invoice.status }, metadata: { reason } });
}

/** Recomputes paid/status from completed payments (inside a transaction). */
export async function recomputeInvoice(tx: Tx, invoiceId: string, today: string) {
  const invoice = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  const paid = await tx.payment.aggregate({ where: { invoiceId, status: "COMPLETED" }, _sum: { amount: true } });
  const paidCents = toCents(paid._sum.amount);
  const status = invoiceStatus(toCents(invoice.total), paidCents, toDateString(invoice.dueDate), today, invoice.status);
  return tx.invoice.update({ where: { id: invoiceId }, data: { amountPaid: fromCents(paidCents), status } });
}
