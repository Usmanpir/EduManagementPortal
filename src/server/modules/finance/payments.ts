import "server-only";
import type { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { campusScope, type TenantContext } from "@/server/auth/context";
import { badRequest, conflict, notFound } from "@/server/http/errors";
import { accessibleSectionIds } from "@/server/modules/academics/scope";
import { fanout, guardianRecipients } from "@/server/modules/communication/fanout";
import { dateOnly, formatDate, formatMoney, todayIn, toDateString } from "@/lib/format";
import type { paymentSchema } from "@/lib/validation/finance";
import { nextReceiptNo, recomputeInvoice } from "./invoices";
import { fromCents, toCents } from "./money";
import { nameMatch } from "@/server/db/search";

export async function recordPayment(ctx: TenantContext, input: z.output<typeof paymentSchema>) {
  const existing = await ctx.db.payment.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { payment: existing, duplicate: true };
  const today = todayIn(ctx.organization.timezone);
  if (input.paidAt > today) throw badRequest("The payment date can't be in the future.", { paidAt: "Can't be in the future." });

  const sections = await accessibleSectionIds(ctx);
  const invoice = await ctx.db.invoice.findFirst({
    where: { id: input.invoiceId, ...campusScope(ctx), ...(sections ? { student: { sectionId: { in: sections } } } : {}) },
    include: { student: { select: { firstName: true, lastName: true } } },
  });
  if (!invoice) throw notFound("Invoice");
  if (invoice.status === "CANCELLED") throw badRequest("This invoice was cancelled.");

  let payment;
  try {
    payment = await ctx.db.$transaction(async (tx) => {
      // Lock the invoice row so two cashiers can't overpay it at the same moment.
      const [locked] = await tx.$queryRaw<{ total: string; amountPaid: string }[]>`
        SELECT "total", "amountPaid" FROM "invoices" WHERE "id" = ${invoice.id}::uuid AND "organizationId" = ${ctx.orgId}::uuid FOR UPDATE`;
      const outstanding = toCents(locked!.total) - toCents(locked!.amountPaid);
      if (outstanding <= 0) throw badRequest("This invoice is already fully paid.");
      if (toCents(input.amount) > outstanding) {
        const msg = `That's more than the balance of ${formatMoney(fromCents(outstanding), ctx.organization.currency)}.`;
        throw badRequest(msg, { amount: msg });
      }
      const created = await tx.payment.create({
        data: {
          organizationId: ctx.orgId,
          campusId: invoice.campusId,
          invoiceId: invoice.id,
          studentId: invoice.studentId,
          receiptNo: await nextReceiptNo(ctx),
          amount: input.amount,
          method: input.method,
          reference: input.reference,
          paidAt: dateOnly(input.paidAt),
          notes: input.notes,
          receivedById: ctx.user.id,
          idempotencyKey: input.idempotencyKey,
        },
      });
      await recomputeInvoice(tx, invoice.id, today);
      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const dup = await ctx.db.payment.findFirst({ where: { idempotencyKey: input.idempotencyKey } });
      if (dup) return { payment: dup, duplicate: true };
      throw conflict("This payment was already recorded.");
    }
    throw error;
  }

  await auditFor(ctx)({ action: "payment.record", entityType: "payment", entityId: payment.id, after: { invoiceNo: invoice.invoiceNo, ...input } });
  const updated = await ctx.db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
  const name = `${invoice.student.firstName} ${invoice.student.lastName}`;
  const balance = formatMoney(Number(updated.total) - Number(updated.amountPaid), ctx.organization.currency);
  await fanout(ctx.orgId, (await guardianRecipients(ctx.orgId, [invoice.studentId])).get(invoice.studentId) ?? [], {
    type: "fee.payment",
    title: "Payment received",
    body: `${formatMoney(input.amount, ctx.organization.currency)} received for ${name}. Receipt ${payment.receiptNo}.`,
    link: `/my/fees?student=${invoice.studentId}`,
    entityType: "payment",
    entityId: payment.id,
    template: "payment_receipt",
    payload: { amount: formatMoney(input.amount, ctx.organization.currency), studentName: name, receiptNo: payment.receiptNo, date: formatDate(input.paidAt, "long"), balance },
    dedupeKey: `payment:${payment.id}`,
  });
  return { payment, duplicate: false };
}

export async function voidPayment(ctx: TenantContext, id: string, reason: string) {
  const payment = await ctx.db.payment.findFirst({ where: { id, ...campusScope(ctx) } });
  if (!payment) throw notFound("Payment");
  if (payment.status === "VOIDED") return;
  await ctx.db.$transaction(async (tx) => {
    await tx.payment.update({ where: { id }, data: { status: "VOIDED", voidedAt: new Date(), voidReason: reason } });
    await recomputeInvoice(tx, payment.invoiceId, todayIn(ctx.organization.timezone));
  });
  await auditFor(ctx)({ action: "payment.void", entityType: "payment", entityId: id, before: { status: "COMPLETED", amount: Number(payment.amount) }, metadata: { reason } });
}

export type PaymentListParams = { q?: string; method?: string[]; from?: string; to?: string; page: number; pageSize: number };

export async function listPayments(ctx: TenantContext, p: PaymentListParams) {
  const where: Prisma.PaymentWhereInput = {
    ...campusScope(ctx),
    ...(p.method?.length ? { method: { in: p.method as never[] } } : {}),
    ...(p.from || p.to ? { paidAt: { ...(p.from ? { gte: dateOnly(p.from) } : {}), ...(p.to ? { lte: dateOnly(p.to) } : {}) } } : {}),
    ...(p.q
      ? {
          OR: [
            { receiptNo: { contains: p.q, mode: "insensitive" } },
            { reference: { contains: p.q, mode: "insensitive" } },
            { invoice: { invoiceNo: { contains: p.q, mode: "insensitive" } } },
            { student: nameMatch(p.q) },
          ],
        }
      : {}),
  };
  const [rows, total, sum] = await Promise.all([
    ctx.db.payment.findMany({
      where,
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      skip: (p.page - 1) * p.pageSize,
      take: p.pageSize,
      include: { invoice: { select: { id: true, invoiceNo: true } }, student: { select: { id: true, firstName: true, lastName: true, admissionNo: true } } },
    }),
    ctx.db.payment.count({ where }),
    ctx.db.payment.aggregate({ where: { ...where, status: "COMPLETED" }, _sum: { amount: true } }),
  ]);
  return {
    total,
    sum: Number(sum._sum.amount ?? 0),
    rows: rows.map((r) => ({
      id: r.id,
      receiptNo: r.receiptNo,
      invoiceId: r.invoice.id,
      invoiceNo: r.invoice.invoiceNo,
      studentId: r.student.id,
      student: `${r.student.firstName} ${r.student.lastName}`,
      admissionNo: r.student.admissionNo,
      amount: Number(r.amount),
      method: r.method,
      reference: r.reference,
      paidAt: toDateString(r.paidAt),
      status: r.status,
    })),
  };
}

/** Unpaid invoices of a student (payment form). */
export async function openInvoices(ctx: TenantContext, studentId: string) {
  const sections = await accessibleSectionIds(ctx);
  const rows = await ctx.db.invoice.findMany({
    where: { studentId, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] }, ...campusScope(ctx), ...(sections ? { student: { sectionId: { in: sections } } } : {}) },
    orderBy: { dueDate: "asc" },
  });
  return rows.map((i) => ({ id: i.id, invoiceNo: i.invoiceNo, title: i.title, dueDate: toDateString(i.dueDate), total: Number(i.total), balance: Number(i.total) - Number(i.amountPaid), status: i.status }));
}

/** A payment receipt, with the invoice balance after it. */
export async function receiptDocument(ctx: TenantContext, id: string) {
  const sections = await accessibleSectionIds(ctx);
  const p = await ctx.db.payment.findFirst({
    where: { id, ...campusScope(ctx), ...(sections ? { student: { sectionId: { in: sections } } } : {}) },
    include: {
      invoice: { select: { id: true, invoiceNo: true, title: true, total: true, amountPaid: true } },
      student: { select: { firstName: true, lastName: true, admissionNo: true, class: { select: { name: true } }, section: { select: { name: true } } } },
    },
  });
  if (!p) return null;
  const receiver = p.receivedById ? await ctx.db.user.findFirst({ where: { id: p.receivedById }, select: { firstName: true, lastName: true } }) : null;
  return {
    id: p.id,
    receiptNo: p.receiptNo,
    amount: Number(p.amount),
    method: p.method as string,
    reference: p.reference,
    paidAt: toDateString(p.paidAt),
    status: p.status as string,
    voidReason: p.voidReason,
    receivedBy: receiver ? `${receiver.firstName} ${receiver.lastName}` : null,
    invoice: { id: p.invoice.id, invoiceNo: p.invoice.invoiceNo, title: p.invoice.title, total: Number(p.invoice.total), balance: Number(p.invoice.total) - Number(p.invoice.amountPaid) },
    student: {
      name: `${p.student.firstName} ${p.student.lastName}`,
      admissionNo: p.student.admissionNo,
      className: p.student.class ? `${p.student.class.name}${p.student.section ? `-${p.student.section.name}` : ""}` : null,
    },
  };
}
