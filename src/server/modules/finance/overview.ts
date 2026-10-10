import "server-only";
import { campusScope, type TenantContext } from "@/server/auth/context";
import { addDays, dateOnly, todayIn, toDateString } from "@/lib/format";

export async function financeOverview(ctx: TenantContext) {
  const today = todayIn(ctx.organization.timezone);
  const scope = campusScope(ctx);
  const monthStart = `${today.slice(0, 7)}-01`;
  const from30 = addDays(today, -29);
  const open = { status: { in: ["PENDING", "PARTIAL", "OVERDUE"] as ("PENDING" | "PARTIAL" | "OVERDUE")[] } };

  const [todaySum, monthSum, outstanding, overdue, byDay, byMethod, recent, topOverdue, overdueCount] = await Promise.all([
    ctx.db.payment.aggregate({ where: { ...scope, status: "COMPLETED", paidAt: dateOnly(today) }, _sum: { amount: true }, _count: true }),
    ctx.db.payment.aggregate({ where: { ...scope, status: "COMPLETED", paidAt: { gte: dateOnly(monthStart) } }, _sum: { amount: true } }),
    ctx.db.invoice.aggregate({ where: { ...scope, ...open }, _sum: { total: true, amountPaid: true }, _count: true }),
    ctx.db.invoice.aggregate({ where: { ...scope, status: "OVERDUE" }, _sum: { total: true, amountPaid: true } }),
    ctx.db.payment.groupBy({ by: ["paidAt"], where: { ...scope, status: "COMPLETED", paidAt: { gte: dateOnly(from30) } }, _sum: { amount: true }, orderBy: { paidAt: "asc" } }),
    ctx.db.payment.groupBy({ by: ["method"], where: { ...scope, status: "COMPLETED", paidAt: { gte: dateOnly(monthStart) } }, _sum: { amount: true }, _count: true }),
    ctx.db.payment.findMany({
      where: { ...scope, status: "COMPLETED" },
      orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      take: 8,
      include: { student: { select: { id: true, firstName: true, lastName: true } }, invoice: { select: { id: true, invoiceNo: true } } },
    }),
    ctx.db.invoice.findMany({
      where: { ...scope, status: "OVERDUE" },
      orderBy: { dueDate: "asc" },
      take: 8,
      include: { student: { select: { id: true, firstName: true, lastName: true, class: { select: { name: true } }, section: { select: { name: true } } } } },
    }),
    ctx.db.invoice.count({ where: { ...scope, status: "OVERDUE" } }),
  ]);

  const daily = new Map(byDay.map((d) => [toDateString(d.paidAt), Number(d._sum.amount ?? 0)]));
  const trend = Array.from({ length: 30 }, (_, i) => {
    const date = addDays(from30, i);
    return { date, amount: daily.get(date) ?? 0 };
  });
  return {
    today: { amount: Number(todaySum._sum.amount ?? 0), count: todaySum._count },
    month: Number(monthSum._sum.amount ?? 0),
    outstanding: Number(outstanding._sum.total ?? 0) - Number(outstanding._sum.amountPaid ?? 0),
    openInvoices: outstanding._count,
    overdue: Number(overdue._sum.total ?? 0) - Number(overdue._sum.amountPaid ?? 0),
    overdueCount,
    trend,
    methods: byMethod.map((m) => ({ method: m.method, amount: Number(m._sum.amount ?? 0), count: m._count })).sort((a, b) => b.amount - a.amount),
    recent: recent.map((p) => ({ id: p.id, receiptNo: p.receiptNo, studentId: p.student.id, student: `${p.student.firstName} ${p.student.lastName}`, invoiceId: p.invoice.id, amount: Number(p.amount), method: p.method, paidAt: toDateString(p.paidAt) })),
    overdueInvoices: topOverdue.map((i) => ({
      id: i.id,
      invoiceNo: i.invoiceNo,
      studentId: i.student.id,
      student: `${i.student.firstName} ${i.student.lastName}`,
      className: i.student.class ? `${i.student.class.name}${i.student.section ? `-${i.student.section.name}` : ""}` : null,
      dueDate: toDateString(i.dueDate),
      balance: Number(i.total) - Number(i.amountPaid),
    })),
  };
}
