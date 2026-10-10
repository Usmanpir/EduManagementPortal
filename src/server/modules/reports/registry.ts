import "server-only";
import { campusScope, can, type TenantContext } from "@/server/auth/context";
import { badRequest, forbidden, notFound } from "@/server/http/errors";
import { accessibleSectionIds } from "@/server/modules/academics/scope";
import { attendanceReport } from "@/server/modules/attendance/report";
import { attendanceRate } from "@/server/modules/attendance/stats";
import { examScope } from "@/server/modules/exams/service";
import { financeReport } from "@/server/modules/finance/report";
import { exportStudents } from "@/server/modules/people/students";
import { addDays, dateOnly, isoWeekday, todayIn, toDateString } from "@/lib/format";
import { reportMeta, type ReportMeta, type ReportParams, type ReportResult } from "@/lib/reports";

const MAX_DAYS = 400;
const METHOD: Record<string, string> = { CASH: "Cash", BANK_TRANSFER: "Bank transfer", CARD: "Card", CHEQUE: "Cheque", ONLINE: "Online", MOBILE_WALLET: "Mobile wallet", OTHER: "Other" };

/** Fills in defaults (last 30 days, this month) and validates ranges. */
export function normalizeParams(ctx: TenantContext, meta: ReportMeta, p: ReportParams) {
  const today = todayIn(ctx.organization.timezone);
  let to = p.to && p.to <= today ? p.to : today;
  let from = p.from ?? addDays(to, -29);
  if (from > to) [from, to] = [to, from];
  if ((dateOnly(to).getTime() - dateOnly(from).getTime()) / 86_400_000 > MAX_DAYS) from = addDays(to, -MAX_DAYS);
  const month = p.month && p.month <= today.slice(0, 7) ? p.month : today.slice(0, 7);
  const n = { ...p, from, to, month, limit: p.limit ?? 5 };
  const missing = (meta.required ?? []).filter((f) => (f === "section" ? !n.sectionId : f === "exam" ? !n.examId : f === "class" ? !n.classId : false));
  return { params: n, missing, today };
}
export type NormalizedParams = ReturnType<typeof normalizeParams>["params"];

export function assertReportAccess(ctx: TenantContext, meta: ReportMeta) {
  if (!can(ctx, "reports.view", ...meta.permissions)) throw forbidden("You don't have access to this report.");
}

async function examFor(ctx: TenantContext, examId: string) {
  const exam = await ctx.db.exam.findFirst({ where: { AND: [{ id: examId }, examScope(ctx)] }, select: { id: true, name: true, status: true } });
  if (!exam) throw notFound("Exam");
  return exam;
}

const RUNNERS: Record<string, (ctx: TenantContext, p: NormalizedParams) => Promise<ReportResult>> = {
  async "attendance-students"(ctx, p) {
    const r = await attendanceReport(ctx, { from: p.from, to: p.to, classId: p.classId ?? null, sectionId: p.sectionId ?? null });
    return {
      columns: [
        { key: "admissionNo", label: "Admission no." },
        { key: "student", label: "Student" },
        { key: "section", label: "Class" },
        { key: "present", label: "Present", format: "number" },
        { key: "late", label: "Late", format: "number" },
        { key: "absent", label: "Absent", format: "number" },
        { key: "leave", label: "Leave", format: "number" },
        { key: "rate", label: "Attendance %", format: "percent" },
      ],
      rows: r.students.map((s) => ({ admissionNo: s.admissionNo, student: s.name, section: s.section ?? "", present: s.counts.present, late: s.counts.late, absent: s.counts.absent, leave: s.counts.leave, rate: s.rate })),
      summary: [
        { label: "Students", value: r.totals.students, format: "number" },
        { label: "School days", value: r.totals.schoolDays, format: "number" },
        { label: "Attendance rate", value: r.totals.rate, format: "percent" },
        { label: "Absences", value: r.totals.absent, format: "number" },
      ],
    };
  },

  async "attendance-low"(ctx, p) {
    const threshold = ctx.settings.attendance.lowAttendanceThreshold;
    const r = await attendanceReport(ctx, { from: p.from, to: p.to, classId: p.classId ?? null });
    const low = r.students.filter((s) => s.rate !== null && s.rate < threshold).sort((a, b) => a.rate! - b.rate!);
    const guardians = low.length
      ? await ctx.db.studentGuardian.findMany({ where: { studentId: { in: low.map((s) => s.studentId) }, isPrimary: true }, select: { studentId: true, guardian: { select: { firstName: true, lastName: true, phone: true } } } })
      : [];
    const g = new Map(guardians.map((x) => [x.studentId, x.guardian]));
    return {
      columns: [
        { key: "student", label: "Student" },
        { key: "section", label: "Class" },
        { key: "absent", label: "Absent", format: "number" },
        { key: "late", label: "Late", format: "number" },
        { key: "rate", label: "Attendance %", format: "percent" },
        { key: "guardian", label: "Parent" },
        { key: "phone", label: "Phone" },
      ],
      rows: low.map((s) => {
        const gd = g.get(s.studentId);
        return { student: s.name, section: s.section ?? "", absent: s.counts.absent, late: s.counts.late, rate: s.rate, guardian: gd ? `${gd.firstName} ${gd.lastName}` : "", phone: gd?.phone ?? "" };
      }),
      summary: [
        { label: "Target", value: threshold, format: "percent" },
        { label: "Below target", value: low.length, format: "number" },
        { label: "Of students", value: r.totals.students, format: "number" },
      ],
    };
  },

  async "attendance-register"(ctx, p) {
    const allowed = await accessibleSectionIds(ctx);
    if (allowed && !allowed.includes(p.sectionId!)) throw notFound("Section");
    const section = await ctx.db.section.findFirst({ where: { id: p.sectionId!, deletedAt: null, ...campusScope(ctx) }, select: { name: true, class: { select: { name: true } } } });
    if (!section) throw notFound("Section");
    const [y, m] = p.month.split("-").map(Number) as [number, number];
    const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const dates = Array.from({ length: days }, (_, i) => `${p.month}-${String(i + 1).padStart(2, "0")}`);
    const off = ctx.settings.attendance.weeklyOffDays;
    const [students, records] = await Promise.all([
      ctx.db.student.findMany({ where: { sectionId: p.sectionId!, archivedAt: null, status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true, rollNumber: true }, orderBy: [{ rollOrder: { sort: "asc", nulls: "last" } }, { firstName: "asc" }] }),
      ctx.db.attendance.findMany({ where: { sectionId: p.sectionId!, slot: "DAY", date: { gte: dateOnly(dates[0]!), lte: dateOnly(dates[dates.length - 1]!) } }, select: { studentId: true, date: true, status: true } }),
    ]);
    const mark: Record<string, string> = { PRESENT: "P", ABSENT: "A", LATE: "L", LEAVE: "Lv", HALF_DAY: "½" };
    const by = new Map(records.map((r) => [`${r.studentId}:${toDateString(r.date)}`, r.status as string]));
    return {
      note: `${section.class.name}-${section.name} · P present · A absent · L late · Lv leave · shaded days are weekly holidays.`,
      columns: [
        { key: "roll", label: "Roll" },
        { key: "student", label: "Student" },
        ...dates.map((d) => ({ key: d, label: String(Number(d.slice(8))), muted: off.includes(isoWeekday(d)) })),
        { key: "P", label: "Present", format: "number" as const },
        { key: "A", label: "Absent", format: "number" as const },
        { key: "rate", label: "%", format: "percent" as const },
      ],
      rows: students.map((s) => {
        const row: Record<string, string | number | null> = { roll: s.rollNumber ?? "", student: `${s.firstName} ${s.lastName}` };
        const counts = { present: 0, absent: 0, late: 0, leave: 0 };
        for (const d of dates) {
          const st = by.get(`${s.id}:${d}`);
          row[d] = st ? (mark[st] ?? "") : "";
          if (st === "PRESENT") counts.present++;
          else if (st === "ABSENT") counts.absent++;
          else if (st === "LATE") counts.late++;
          else if (st === "LEAVE") counts.leave++;
        }
        row.P = counts.present + counts.late;
        row.A = counts.absent;
        row.rate = attendanceRate(counts);
        return row;
      }),
    };
  },

  async "staff-attendance"(ctx, p) {
    const [staff, records] = await Promise.all([
      ctx.db.staff.findMany({ where: { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...campusScope(ctx) }, select: { id: true, employeeCode: true, firstName: true, lastName: true, designation: true, department: { select: { name: true } } }, orderBy: [{ firstName: "asc" }] }),
      ctx.db.staffAttendance.groupBy({ by: ["staffId", "status"], where: { date: { gte: dateOnly(p.from), lte: dateOnly(p.to) }, ...campusScope(ctx) }, _count: true }),
    ]);
    const count = (id: string, st: string) => records.find((r) => r.staffId === id && r.status === st)?._count ?? 0;
    const rows = staff.map((s) => {
      const c = { present: count(s.id, "PRESENT") + count(s.id, "HALF_DAY"), late: count(s.id, "LATE"), absent: count(s.id, "ABSENT"), leave: count(s.id, "LEAVE") };
      return { code: s.employeeCode, name: `${s.firstName} ${s.lastName}`, designation: s.designation, department: s.department?.name ?? "", ...c, rate: attendanceRate(c) };
    });
    return {
      columns: [
        { key: "code", label: "Employee ID" },
        { key: "name", label: "Name" },
        { key: "designation", label: "Designation" },
        { key: "department", label: "Department" },
        { key: "present", label: "Present", format: "number" },
        { key: "late", label: "Late", format: "number" },
        { key: "absent", label: "Absent", format: "number" },
        { key: "leave", label: "Leave", format: "number" },
        { key: "rate", label: "Attendance %", format: "percent" },
      ],
      rows,
      summary: [
        { label: "Staff", value: rows.length, format: "number" },
        { label: "Late arrivals", value: rows.reduce((n, r) => n + r.late, 0), format: "number" },
        { label: "Absences", value: rows.reduce((n, r) => n + r.absent, 0), format: "number" },
      ],
    };
  },

  async "fee-collections"(ctx, p) {
    const payments = await ctx.db.payment.findMany({
      where: { ...campusScope(ctx), status: "COMPLETED", paidAt: { gte: dateOnly(p.from), lte: dateOnly(p.to) }, ...(p.method ? { method: p.method } : {}) },
      orderBy: [{ paidAt: "asc" }, { receiptNo: "asc" }],
      take: 20_000,
      include: { invoice: { select: { invoiceNo: true } }, student: { select: { admissionNo: true, firstName: true, lastName: true, class: { select: { name: true } }, section: { select: { name: true } } } } },
    });
    const total = payments.reduce((n, x) => n + Number(x.amount), 0);
    const byMethod = new Map<string, number>();
    for (const x of payments) byMethod.set(x.method, (byMethod.get(x.method) ?? 0) + Number(x.amount));
    return {
      columns: [
        { key: "date", label: "Date", format: "date" },
        { key: "receipt", label: "Receipt" },
        { key: "student", label: "Student" },
        { key: "admissionNo", label: "Admission no." },
        { key: "className", label: "Class" },
        { key: "invoice", label: "Invoice" },
        { key: "method", label: "Method" },
        { key: "reference", label: "Reference" },
        { key: "amount", label: "Amount", format: "money" },
      ],
      rows: payments.map((x) => ({
        date: toDateString(x.paidAt),
        receipt: x.receiptNo,
        student: `${x.student.firstName} ${x.student.lastName}`,
        admissionNo: x.student.admissionNo,
        className: x.student.class ? `${x.student.class.name}${x.student.section ? `-${x.student.section.name}` : ""}` : "",
        invoice: x.invoice.invoiceNo,
        method: METHOD[x.method] ?? x.method,
        reference: x.reference ?? "",
        amount: Number(x.amount),
      })),
      summary: [
        { label: "Total received", value: total, format: "money" },
        { label: "Payments", value: payments.length, format: "number" },
        ...[...byMethod.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ label: METHOD[k] ?? k, value: v, format: "money" as const })),
      ],
    };
  },

  async "fee-outstanding"(ctx, p) {
    const r = await financeReport(ctx, { from: p.from, to: p.to, classId: p.classId ?? null });
    return {
      columns: [
        { key: "student", label: "Student" },
        { key: "admissionNo", label: "Admission no." },
        { key: "className", label: "Class" },
        { key: "guardian", label: "Guardian" },
        { key: "phone", label: "Phone" },
        { key: "invoices", label: "Unpaid invoices", format: "number" },
        { key: "overdue", label: "Overdue", format: "number" },
        { key: "oldestDue", label: "Oldest due", format: "date" },
        { key: "balance", label: "Balance", format: "money" },
      ],
      rows: r.owing.map((o) => ({ student: o.name, admissionNo: o.admissionNo, className: o.className ?? "", guardian: o.guardian ?? "", phone: o.phone ?? "", invoices: o.invoices, overdue: o.overdue, oldestDue: o.oldestDue, balance: o.balance })),
      summary: [
        { label: "Outstanding", value: r.totals.outstanding, format: "money" },
        { label: "Students owing", value: r.totals.owingStudents, format: "number" },
      ],
    };
  },

  async "fee-by-class"(ctx, p) {
    const r = await financeReport(ctx, { from: p.from, to: p.to, classId: null });
    return {
      note: "Billed and collected amounts are for invoices issued in the chosen period.",
      columns: [
        { key: "name", label: "Class" },
        { key: "billed", label: "Billed", format: "money" },
        { key: "collected", label: "Collected", format: "money" },
        { key: "outstanding", label: "Outstanding", format: "money" },
        { key: "rate", label: "Collected %", format: "percent" },
      ],
      rows: r.classes.map((c) => ({ name: c.name, billed: c.billed, collected: c.collected, outstanding: c.outstanding, rate: c.rate })),
      summary: [
        { label: "Billed", value: r.totals.billed, format: "money" },
        { label: "Collected", value: r.totals.collectedOnBilled, format: "money" },
        { label: "Collection rate", value: r.totals.collectionRate, format: "percent" },
      ],
    };
  },

  async "exam-subjects"(ctx, p) {
    const exam = await examFor(ctx, p.examId!);
    const allowed = await accessibleSectionIds(ctx);
    const papers = await ctx.db.examSubject.findMany({
      where: { examId: exam.id, ...(p.classId ? { classId: p.classId } : {}), class: { deletedAt: null, ...campusScope(ctx) } },
      include: {
        subject: { select: { name: true } },
        class: { select: { name: true, level: true, campus: { select: { code: true } } } },
        marks: { where: allowed ? { student: { sectionId: { in: allowed } } } : {}, select: { marksObtained: true, isAbsent: true } },
      },
      orderBy: [{ class: { level: "asc" } }, { subject: { name: "asc" } }],
    });
    const multi = new Set(papers.map((x) => x.class.campus.code)).size > 1;
    const rows = papers.map((x) => {
      const max = Number(x.maxMarks);
      const pass = Number(x.passMarks);
      const scored = x.marks.filter((m) => !m.isAbsent && m.marksObtained !== null).map((m) => Number(m.marksObtained));
      const absent = x.marks.filter((m) => m.isAbsent).length;
      const sat = scored.length;
      return {
        className: multi ? `${x.class.name} · ${x.class.campus.code}` : x.class.name,
        subject: x.subject.name,
        max,
        sat,
        absent,
        average: sat ? (scored.reduce((a, b) => a + b, 0) / sat / max) * 100 : null,
        highest: sat ? Math.max(...scored) : null,
        lowest: sat ? Math.min(...scored) : null,
        passRate: sat + absent ? (scored.filter((v) => v >= pass).length / (sat + absent)) * 100 : null,
      };
    });
    const weakest = rows.filter((r) => r.passRate !== null).sort((a, b) => a.passRate! - b.passRate!)[0];
    return {
      note: exam.status === "PUBLISHED" ? undefined : "Results for this exam aren't published yet; figures include marks entered so far.",
      columns: [
        { key: "className", label: "Class" },
        { key: "subject", label: "Subject" },
        { key: "max", label: "Out of", format: "number" },
        { key: "sat", label: "Sat", format: "number" },
        { key: "absent", label: "Absent", format: "number" },
        { key: "average", label: "Average %", format: "percent" },
        { key: "highest", label: "Highest", format: "number" },
        { key: "lowest", label: "Lowest", format: "number" },
        { key: "passRate", label: "Pass rate", format: "percent" },
      ],
      rows,
      summary: [
        { label: "Exam", value: exam.name },
        { label: "Papers", value: rows.length, format: "number" },
        { label: "Weakest paper", value: weakest ? `${weakest.subject} (${weakest.className})` : "—" },
      ],
    };
  },

  async "exam-toppers"(ctx, p) {
    const exam = await examFor(ctx, p.examId!);
    const allowed = await accessibleSectionIds(ctx);
    const results = await ctx.db.result.findMany({
      where: { examId: exam.id, status: { not: "INCOMPLETE" }, position: { not: null, lte: p.limit }, student: { ...campusScope(ctx), ...(allowed ? { sectionId: { in: allowed } } : {}) } },
      include: { student: { select: { firstName: true, lastName: true, admissionNo: true, campus: { select: { code: true } }, section: { select: { name: true, class: { select: { name: true, level: true } } } } } } },
    });
    const multi = new Set(results.map((r) => r.student.campus.code)).size > 1;
    results.sort((a, b) => a.student.campus.code.localeCompare(b.student.campus.code) || (a.student.section?.class.level ?? 0) - (b.student.section?.class.level ?? 0) || (a.student.section?.name ?? "").localeCompare(b.student.section?.name ?? "") || (a.position ?? 0) - (b.position ?? 0));
    return {
      note: exam.status === "PUBLISHED" ? undefined : "Results aren't published yet — positions are provisional.",
      columns: [
        { key: "section", label: "Class" },
        { key: "position", label: "Position", format: "number" },
        { key: "student", label: "Student" },
        { key: "admissionNo", label: "Admission no." },
        { key: "percentage", label: "%", format: "percent" },
        { key: "grade", label: "Grade" },
      ],
      rows: results.map((r) => ({
        section: r.student.section ? `${r.student.section.class.name}-${r.student.section.name}${multi ? ` · ${r.student.campus.code}` : ""}` : "",
        position: r.position,
        student: `${r.student.firstName} ${r.student.lastName}`,
        admissionNo: r.student.admissionNo,
        percentage: Number(r.percentage),
        grade: r.grade,
      })),
    };
  },

  async "students-roster"(ctx, p) {
    const rows = await exportStudents(ctx, { classId: p.classId ? [p.classId] : undefined, sectionId: p.sectionId ? [p.sectionId] : undefined, status: [p.status ?? "ACTIVE"] });
    return {
      columns: [
        { key: "Admission No", label: "Admission no." },
        { key: "Name", label: "Student" },
        { key: "Class", label: "Class" },
        { key: "Roll No", label: "Roll" },
        { key: "Gender", label: "Gender" },
        { key: "Date of Birth", label: "Date of birth", format: "date" },
        { key: "Guardian Name", label: "Guardian" },
        { key: "Guardian Phone", label: "Guardian phone" },
      ],
      rows: rows.map((r) => ({ ...r, Name: `${r["First Name"]} ${r["Last Name"]}`, Class: [r.Class, r.Section].filter(Boolean).join("-"), Gender: r.Gender ? r.Gender.charAt(0) + r.Gender.slice(1).toLowerCase() : "" })),
      summary: [{ label: "Students", value: rows.length, format: "number" }],
    };
  },

  async enrollment(ctx) {
    const allowed = await accessibleSectionIds(ctx);
    const sections = await ctx.db.section.findMany({
      where: { deletedAt: null, ...campusScope(ctx), ...(allowed ? { id: { in: allowed } } : {}) },
      select: { id: true, name: true, capacity: true, campus: { select: { code: true } }, class: { select: { name: true, level: true } } },
      orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
    });
    const counts = await ctx.db.student.groupBy({ by: ["sectionId", "gender"], where: { sectionId: { in: sections.map((s) => s.id) }, status: "ACTIVE", archivedAt: null }, _count: true });
    const multi = new Set(sections.map((s) => s.campus.code)).size > 1;
    const c = (id: string, g?: string) => counts.filter((x) => x.sectionId === id && (!g || x.gender === g)).reduce((n, x) => n + x._count, 0);
    const rows = sections.map((s) => {
      const total = c(s.id);
      return { className: `${s.class.name}-${s.name}${multi ? ` · ${s.campus.code}` : ""}`, boys: c(s.id, "MALE"), girls: c(s.id, "FEMALE"), total, capacity: s.capacity, fill: s.capacity ? (total / s.capacity) * 100 : null };
    });
    return {
      columns: [
        { key: "className", label: "Section" },
        { key: "boys", label: "Boys", format: "number" },
        { key: "girls", label: "Girls", format: "number" },
        { key: "total", label: "Total", format: "number" },
        { key: "capacity", label: "Capacity", format: "number" },
        { key: "fill", label: "Filled", format: "percent" },
      ],
      rows,
      summary: [
        { label: "Students", value: rows.reduce((n, r) => n + r.total, 0), format: "number" },
        { label: "Sections", value: rows.length, format: "number" },
        { label: "Boys / girls", value: `${rows.reduce((n, r) => n + r.boys, 0)} / ${rows.reduce((n, r) => n + r.girls, 0)}` },
      ],
    };
  },
};

/** Runs a report for the signed-in user (permission + data scope enforced). */
export async function runReport(ctx: TenantContext, key: string, raw: ReportParams) {
  const meta = reportMeta(key);
  const run = RUNNERS[key];
  if (!meta || !run) throw notFound("Report");
  assertReportAccess(ctx, meta);
  const { params, missing } = normalizeParams(ctx, meta, raw);
  if (missing.length) throw badRequest(`Choose ${missing[0] === "exam" ? "an exam" : `a ${missing[0]}`} to run this report.`);
  const result = await run(ctx, params);
  return { meta, params, result };
}

/** Options for the report filters, limited to what the user can see. */
export async function reportFilterOptions(ctx: TenantContext) {
  const allowed = await accessibleSectionIds(ctx);
  const [classes, sections, exams] = await Promise.all([
    ctx.db.class.findMany({ where: { deletedAt: null, ...campusScope(ctx), ...(allowed ? { sections: { some: { id: { in: allowed } } } } : {}) }, select: { id: true, name: true, campus: { select: { code: true } } }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
    ctx.db.section.findMany({ where: { deletedAt: null, ...campusScope(ctx), ...(allowed ? { id: { in: allowed } } : {}) }, select: { id: true, name: true, classId: true, campus: { select: { code: true } }, class: { select: { name: true } } }, orderBy: [{ class: { level: "asc" } }, { name: "asc" }] }),
    can(ctx, "results.view") ? ctx.db.exam.findMany({ where: { AND: [examScope(ctx), { subjects: { some: {} } }] }, select: { id: true, name: true, status: true }, orderBy: { startDate: "desc" } }) : [],
  ]);
  const multi = new Set(classes.map((c) => c.campus.code)).size > 1;
  return {
    classes: classes.map((c) => ({ value: c.id, label: multi ? `${c.name} · ${c.campus.code}` : c.name })),
    sections: sections.map((s) => ({ value: s.id, label: `${s.class.name}-${s.name}${multi ? ` · ${s.campus.code}` : ""}`, classId: s.classId })),
    exams: exams.map((e) => ({ value: e.id, label: `${e.name}${e.status === "PUBLISHED" ? "" : " (unpublished)"}` })),
  };
}
