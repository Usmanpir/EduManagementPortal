import "server-only";
import { cache } from "react";
import type { TenantContext } from "@/server/auth/context";
import { notFound } from "@/server/http/errors";
import { buildCards } from "@/server/modules/exams/results";
import { invoiceDocuments } from "@/server/modules/finance/invoices";
import { getTimetable } from "@/server/modules/timetable/service";
import { attendanceRate } from "@/server/modules/attendance/stats";
import { addDays, dateOnly, todayIn, toDateString } from "@/lib/format";

/**
 * The students a portal user may see: a parent's linked children, or a
 * student's own record. Every /my page goes through this — the requested
 * student id from the URL is only ever used to pick from this list.
 */
export const myStudents = cache(async (ctx: TenantContext) => {
  const where = ctx.guardianId
    ? { guardians: { some: { guardianId: ctx.guardianId } } }
    : ctx.studentId
      ? { id: ctx.studentId }
      : null;
  if (!where) return [];
  const rows = await ctx.db.student.findMany({
    where: { ...where, archivedAt: null },
    select: { id: true, firstName: true, lastName: true, admissionNo: true, rollNumber: true, campusId: true, classId: true, sectionId: true, status: true, class: { select: { name: true } }, section: { select: { name: true } } },
    orderBy: [{ class: { level: "desc" } }, { firstName: "asc" }],
  });
  return rows.map((s) => ({
    id: s.id,
    name: `${s.firstName} ${s.lastName}`,
    firstName: s.firstName,
    admissionNo: s.admissionNo,
    rollNumber: s.rollNumber,
    campusId: s.campusId,
    classId: s.classId,
    sectionId: s.sectionId,
    className: s.class ? `${s.class.name}${s.section ? `-${s.section.name}` : ""}` : null,
    active: s.status === "ACTIVE",
  }));
});

export type MyStudent = Awaited<ReturnType<typeof myStudents>>[number];

/** Picks the requested child if it's one of theirs; otherwise their first. */
export async function resolveStudent(ctx: TenantContext, requested: unknown) {
  const students = await myStudents(ctx);
  const student = (typeof requested === "string" && students.find((s) => s.id === requested)) || students[0] || null;
  return { students, student };
}

async function assertMine(ctx: TenantContext, studentId: string) {
  const s = (await myStudents(ctx)).find((x) => x.id === studentId);
  if (!s) throw notFound("Student");
  return s;
}

/** A month of daily attendance plus term-to-date totals. */
export async function myAttendance(ctx: TenantContext, studentId: string, month: string) {
  await assertMine(ctx, studentId);
  const today = todayIn(ctx.organization.timezone);
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = toDateString(new Date(Date.UTC(y, m, 0)));
  const year = await ctx.db.academicYear.findFirst({ where: { isCurrent: true }, select: { startDate: true } });
  const since = year ? toDateString(year.startDate) : addDays(today, -365);

  const [days, totals, leave] = await Promise.all([
    ctx.db.attendance.findMany({ where: { studentId, slot: "DAY", date: { gte: dateOnly(first), lte: dateOnly(last) } }, select: { date: true, status: true, note: true }, orderBy: { date: "asc" } }),
    ctx.db.attendance.groupBy({ by: ["status"], where: { studentId, slot: "DAY", date: { gte: dateOnly(since), lte: dateOnly(today) } }, _count: true }),
    ctx.db.leaveRequest.findMany({ where: { studentId, status: { in: ["PENDING", "APPROVED"] }, endDate: { gte: dateOnly(addDays(today, -60)) } }, orderBy: { startDate: "desc" }, take: 5, select: { id: true, type: true, startDate: true, endDate: true, status: true } }),
  ]);
  const count = (s: string) => totals.find((t) => t.status === s)?._count ?? 0;
  const counts = { present: count("PRESENT"), absent: count("ABSENT"), late: count("LATE"), leave: count("LEAVE") };
  return {
    month,
    since,
    days: days.map((d) => ({ date: toDateString(d.date), status: d.status as string, note: d.note })),
    counts,
    rate: attendanceRate(counts),
    threshold: ctx.settings.attendance.lowAttendanceThreshold,
    offDays: ctx.settings.attendance.weeklyOffDays,
    leave: leave.map((l) => ({ id: l.id, type: l.type as string, from: toDateString(l.startDate), to: toDateString(l.endDate), status: l.status as string })),
  };
}

/** The child's class timetable (read-only). */
export async function myTimetable(ctx: TenantContext, studentId: string) {
  const s = await assertMine(ctx, studentId);
  if (!s.sectionId) return null;
  return getTimetable(ctx, "section", s.sectionId, { authorized: true });
}

/** Published results only — drafts are never shown to families. */
export async function myResults(ctx: TenantContext, studentId: string) {
  await assertMine(ctx, studentId);
  const results = await ctx.db.result.findMany({
    where: { studentId, publishedAt: { not: null }, exam: { status: "PUBLISHED" } },
    include: { exam: { select: { id: true, name: true, type: true, startDate: true, endDate: true, publishedAt: true } } },
    orderBy: { exam: { startDate: "desc" } },
  });
  return results.map((r) => ({
    examId: r.exam.id,
    exam: r.exam.name,
    type: r.exam.type as string,
    from: toDateString(r.exam.startDate),
    publishedAt: r.exam.publishedAt?.toISOString() ?? null,
    percentage: Number(r.percentage),
    grade: r.grade,
    position: ctx.settings.exams.showPosition ? r.position : null,
    status: r.status as string,
  }));
}

/** One published report card for the child. */
export async function myReportCard(ctx: TenantContext, studentId: string, examId: string) {
  await assertMine(ctx, studentId);
  const exam = await ctx.db.exam.findFirst({ where: { id: examId, status: "PUBLISHED" } });
  if (!exam) throw notFound("Result");
  const student = await ctx.db.student.findFirstOrThrow({
    where: { id: studentId },
    select: { id: true, firstName: true, lastName: true, admissionNo: true, rollNumber: true, classId: true, sectionId: true, class: { select: { name: true } }, section: { select: { name: true } }, guardians: { where: { isPrimary: true }, take: 1, select: { guardian: { select: { firstName: true, lastName: true } } } } },
  });
  const [card] = await buildCards(ctx, exam, [student]);
  if (!card?.result) throw notFound("Result");
  return card;
}

/** Invoices and payments for the child. */
export async function myFees(ctx: TenantContext, studentId: string) {
  await assertMine(ctx, studentId);
  const invoices = await ctx.db.invoice.findMany({
    where: { studentId, status: { not: "CANCELLED" } },
    include: { payments: { where: { status: "COMPLETED" }, orderBy: { paidAt: "desc" }, select: { id: true, receiptNo: true, amount: true, method: true, paidAt: true } } },
    orderBy: [{ dueDate: "desc" }],
    take: 36,
  });
  const open = invoices.filter((i) => ["PENDING", "PARTIAL", "OVERDUE"].includes(i.status));
  return {
    balance: open.reduce((n, i) => n + Number(i.total) - Number(i.amountPaid), 0),
    overdue: open.filter((i) => i.status === "OVERDUE").reduce((n, i) => n + Number(i.total) - Number(i.amountPaid), 0),
    nextDue: open.map((i) => toDateString(i.dueDate)).sort()[0] ?? null,
    paymentInstructions: ctx.settings.finance.invoiceFooter,
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNo: i.invoiceNo,
      title: i.title,
      dueDate: toDateString(i.dueDate),
      total: Number(i.total),
      paid: Number(i.amountPaid),
      balance: Number(i.total) - Number(i.amountPaid),
      status: i.status as string,
      payments: i.payments.map((p) => ({ id: p.id, receiptNo: p.receiptNo, amount: Number(p.amount), method: p.method as string, paidAt: toDateString(p.paidAt) })),
    })),
  };
}

/** Invoice / receipt documents for families: only for their own child. */
export async function myInvoiceDocument(ctx: TenantContext, invoiceId: string) {
  const mine = (await myStudents(ctx)).map((s) => s.id);
  const inv = await ctx.db.invoice.findFirst({ where: { id: invoiceId, studentId: { in: mine } }, select: { id: true } });
  if (!inv) throw notFound("Invoice");
  const [doc] = await invoiceDocuments(ctx, [inv.id], { authorized: true });
  return doc ?? null;
}

/** A compact summary per child for the family dashboard. */
export async function familyDashboard(ctx: TenantContext) {
  const students = await myStudents(ctx);
  const today = todayIn(ctx.organization.timezone);
  const monthStart = `${today.slice(0, 7)}-01`;
  return Promise.all(
    students.map(async (s) => {
      const [todayMark, month, fees, latest, nextExam] = await Promise.all([
        ctx.db.attendance.findFirst({ where: { studentId: s.id, slot: "DAY", date: dateOnly(today) }, select: { status: true } }),
        ctx.db.attendance.groupBy({ by: ["status"], where: { studentId: s.id, slot: "DAY", date: { gte: dateOnly(monthStart), lte: dateOnly(today) } }, _count: true }),
        ctx.db.invoice.findMany({ where: { studentId: s.id, status: { in: ["PENDING", "PARTIAL", "OVERDUE"] } }, select: { total: true, amountPaid: true, dueDate: true, status: true } }),
        ctx.db.result.findFirst({ where: { studentId: s.id, publishedAt: { not: null }, exam: { status: "PUBLISHED" } }, orderBy: { exam: { startDate: "desc" } }, include: { exam: { select: { id: true, name: true } } } }),
        s.classId
          ? ctx.db.exam.findFirst({ where: { status: "SCHEDULED", endDate: { gte: dateOnly(today) }, subjects: { some: { classId: s.classId } } }, orderBy: { startDate: "asc" }, select: { id: true, name: true, startDate: true, endDate: true } })
          : null,
      ]);
      const c = (st: string) => month.find((m) => m.status === st)?._count ?? 0;
      const counts = { present: c("PRESENT"), absent: c("ABSENT"), late: c("LATE"), leave: c("LEAVE") };
      return {
        ...s,
        today: todayMark?.status ?? null,
        month: { counts, rate: attendanceRate(counts) },
        fees: {
          balance: fees.reduce((n, i) => n + Number(i.total) - Number(i.amountPaid), 0),
          overdue: fees.some((i) => i.status === "OVERDUE"),
          nextDue: fees.map((i) => toDateString(i.dueDate)).sort()[0] ?? null,
        },
        latestResult: latest ? { examId: latest.exam.id, exam: latest.exam.name, percentage: Number(latest.percentage), grade: latest.grade, position: ctx.settings.exams.showPosition ? latest.position : null } : null,
        nextExam: nextExam ? { id: nextExam.id, name: nextExam.name, from: toDateString(nextExam.startDate), to: toDateString(nextExam.endDate) } : null,
      };
    }),
  );
}
