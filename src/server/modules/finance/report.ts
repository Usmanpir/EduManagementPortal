import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { campusScope, type TenantContext } from "@/server/auth/context";
import { dateOnly, toDateString } from "@/lib/format";
import { fromCents, toCents } from "./money";

export type FinanceReportParams = { from: string; to: string; classId: string | null };

const OPEN = ["PENDING", "PARTIAL", "OVERDUE"] as const;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Billing vs. collection for a date range (by invoice issue date), payments
 * received in the range, and who owes what right now.
 */
export async function financeReport(ctx: TenantContext, p: FinanceReportParams) {
  const scope = campusScope(ctx);
  const studentFilter: Prisma.InvoiceWhereInput = p.classId ? { student: { classId: p.classId } } : {};
  const range = { gte: dateOnly(p.from), lte: dateOnly(p.to) };

  const multiCampus = (await ctx.db.campus.count({ where: { deletedAt: null, ...(ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {}) } })) > 1;
  const [billed, payments, open] = await Promise.all([
    ctx.db.invoice.findMany({
      where: { ...scope, ...studentFilter, status: { not: "CANCELLED" }, issueDate: range },
      select: { total: true, amountPaid: true, discount: true, student: { select: { classId: true, class: { select: { name: true, level: true, campus: { select: { code: true } } } } } } },
    }),
    ctx.db.payment.findMany({
      where: { ...scope, status: "COMPLETED", paidAt: range, ...(p.classId ? { student: { classId: p.classId } } : {}) },
      select: { amount: true, paidAt: true, method: true },
    }),
    ctx.db.invoice.findMany({
      where: { ...scope, ...studentFilter, status: { in: [...OPEN] } },
      select: {
        total: true,
        amountPaid: true,
        dueDate: true,
        status: true,
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            admissionNo: true,
            class: { select: { name: true } },
            section: { select: { name: true } },
            guardians: { where: { isPrimary: true }, take: 1, select: { guardian: { select: { firstName: true, lastName: true, phone: true } } } },
          },
        },
      },
    }),
  ]);

  // By class: billed vs collected on invoices issued in range.
  const classes = new Map<string, { id: string; name: string; level: number; billed: number; collected: number; discount: number }>();
  let billedCents = 0;
  let collectedOnBilled = 0;
  let discountCents = 0;
  for (const inv of billed) {
    const key = inv.student.classId ?? "none";
    const row = classes.get(key) ?? { id: key, name: inv.student.class ? `${inv.student.class.name}${multiCampus ? ` · ${inv.student.class.campus.code}` : ""}` : "Not placed", level: inv.student.class?.level ?? 999, billed: 0, collected: 0, discount: 0 };
    row.billed += toCents(inv.total);
    row.collected += toCents(inv.amountPaid);
    row.discount += toCents(inv.discount);
    classes.set(key, row);
    billedCents += toCents(inv.total);
    collectedOnBilled += toCents(inv.amountPaid);
    discountCents += toCents(inv.discount);
  }

  // Payments received, by month.
  const byMonth = new Map<string, number>();
  let receivedCents = 0;
  for (const pay of payments) {
    const m = toDateString(pay.paidAt).slice(0, 7);
    byMonth.set(m, (byMonth.get(m) ?? 0) + toCents(pay.amount));
    receivedCents += toCents(pay.amount);
  }
  const months: string[] = [];
  for (let m = p.from.slice(0, 7); m <= p.to.slice(0, 7); ) {
    months.push(m);
    const [y, mo] = m.split("-").map(Number) as [number, number];
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  }

  // Outstanding by student (now, not limited to the range).
  const owing = new Map<string, { studentId: string; name: string; admissionNo: string; className: string | null; guardian: string | null; phone: string | null; balance: number; invoices: number; overdue: number; oldestDue: string }>();
  let outstandingCents = 0;
  for (const inv of open) {
    const s = inv.student;
    const bal = toCents(inv.total) - toCents(inv.amountPaid);
    outstandingCents += bal;
    const due = toDateString(inv.dueDate);
    const g = s.guardians[0]?.guardian;
    const row = owing.get(s.id) ?? {
      studentId: s.id,
      name: `${s.firstName} ${s.lastName}`,
      admissionNo: s.admissionNo,
      className: s.class ? `${s.class.name}${s.section ? `-${s.section.name}` : ""}` : null,
      guardian: g ? `${g.firstName} ${g.lastName}` : null,
      phone: g?.phone ?? null,
      balance: 0,
      invoices: 0,
      overdue: 0,
      oldestDue: due,
    };
    row.balance += bal;
    row.invoices += 1;
    if (inv.status === "OVERDUE") row.overdue += 1;
    if (due < row.oldestDue) row.oldestDue = due;
    owing.set(s.id, row);
  }

  return {
    params: p,
    totals: {
      billed: fromCents(billedCents),
      collectedOnBilled: fromCents(collectedOnBilled),
      collectionRate: billedCents ? (collectedOnBilled / billedCents) * 100 : null,
      discounts: fromCents(discountCents),
      received: fromCents(receivedCents),
      payments: payments.length,
      outstanding: fromCents(outstandingCents),
      owingStudents: owing.size,
    },
    monthly: months.map((m) => ({ month: m, label: `${MONTHS[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`, amount: fromCents(byMonth.get(m) ?? 0) })),
    classes: [...classes.values()]
      .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
      .map((c) => ({ id: c.id, name: c.name, billed: fromCents(c.billed), collected: fromCents(c.collected), outstanding: fromCents(c.billed - c.collected), rate: c.billed ? (c.collected / c.billed) * 100 : null })),
    owing: [...owing.values()].map((o) => ({ ...o, balance: fromCents(o.balance) })).sort((a, b) => b.balance - a.balance),
  };
}

/** Flat rows for export: either who owes what, or collection by class. */
export async function financeReportRows(ctx: TenantContext, p: FinanceReportParams, kind: "outstanding" | "classes") {
  const r = await financeReport(ctx, p);
  if (kind === "classes") {
    return r.classes.map((c) => ({ Class: c.name, Billed: c.billed, Collected: c.collected, Outstanding: c.outstanding, "Collection %": c.rate === null ? "" : Number(c.rate.toFixed(1)) }));
  }
  return r.owing.map((o) => ({
    Student: o.name,
    "Admission no.": o.admissionNo,
    Class: o.className ?? "",
    Guardian: o.guardian ?? "",
    Phone: o.phone ?? "",
    "Unpaid invoices": o.invoices,
    Overdue: o.overdue,
    "Oldest due": o.oldestDue,
    Balance: o.balance,
  }));
}
