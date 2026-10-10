import "server-only";
import { campusScope, can, type TenantContext } from "@/server/auth/context";
import { accessibleSectionIds } from "@/server/modules/academics/scope";
import { examScope } from "@/server/modules/exams/service";
import { dateOnly, todayIn } from "@/lib/format";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function lastMonths(today: string, n: number) {
  const [y, m] = today.split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, m - n + i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
}
const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5)) - 1]} ${ym.slice(2, 4)}`;

/** Six-month trends and breakdowns across attendance, fees, exams and enrollment — each only if permitted. */
export async function analytics(ctx: TenantContext) {
  const today = todayIn(ctx.organization.timezone);
  const months = lastMonths(today, 6);
  const since = dateOnly(`${months[0]}-01`);
  const scope = campusScope(ctx);
  const allowed = await accessibleSectionIds(ctx);
  const sectionWhere = { ...scope, ...(allowed ? { sectionId: { in: allowed } } : {}) };
  const multiCampus = (await ctx.db.campus.count({ where: { deletedAt: null, ...(ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {}) } })) > 1;

  const attendance = can(ctx, "attendance.view")
    ? await (async () => {
        const sessions = await ctx.db.attendanceSession.findMany({
          where: { ...sectionWhere, slot: ctx.settings.attendance.mode === "DAILY" ? "DAY" : undefined, date: { gte: since, lte: dateOnly(today) } },
          select: { date: true, presentCount: true, lateCount: true, absentCount: true, section: { select: { classId: true, class: { select: { name: true, level: true, campus: { select: { code: true } } } } } } },
        });
        const byMonth = new Map<string, { p: number; n: number }>();
        const byClass = new Map<string, { label: string; level: number; p: number; n: number }>();
        const thisMonth = today.slice(0, 7);
        for (const s of sessions) {
          const ym = s.date.toISOString().slice(0, 7);
          const present = s.presentCount + s.lateCount;
          const counted = present + s.absentCount;
          const m = byMonth.get(ym) ?? { p: 0, n: 0 };
          m.p += present;
          m.n += counted;
          byMonth.set(ym, m);
          // Class comparison over the last 30 days-ish: the current and previous month.
          if (ym >= months[months.length - 2]! && ym <= thisMonth) {
            const c = byClass.get(s.section.classId) ?? { label: `${s.section.class.name}${multiCampus ? ` · ${s.section.class.campus.code}` : ""}`, level: s.section.class.level, p: 0, n: 0 };
            c.p += present;
            c.n += counted;
            byClass.set(s.section.classId, c);
          }
        }
        return {
          monthly: months.map((ym) => {
            const m = byMonth.get(ym);
            return { label: monthLabel(ym), rate: m && m.n ? (m.p / m.n) * 100 : null };
          }),
          byClass: [...byClass.entries()].map(([id, c]) => ({ id, label: c.label, value: c.n ? (c.p / c.n) * 100 : 0, level: c.level })).sort((a, b) => a.value - b.value),
        };
      })()
    : null;

  const fees = can(ctx, "payments.view")
    ? await (async () => {
        const rows = await ctx.db.payment.groupBy({ by: ["paidAt"], where: { ...scope, status: "COMPLETED", paidAt: { gte: since } }, _sum: { amount: true } });
        const billed = await ctx.db.invoice.aggregate({ where: { ...scope, status: { not: "CANCELLED" }, issueDate: { gte: since } }, _sum: { total: true, amountPaid: true } });
        const byMonth = new Map<string, number>();
        for (const r of rows) {
          const ym = r.paidAt.toISOString().slice(0, 7);
          byMonth.set(ym, (byMonth.get(ym) ?? 0) + Number(r._sum.amount ?? 0));
        }
        const total = Number(billed._sum.total ?? 0);
        return {
          monthly: months.map((ym) => ({ label: monthLabel(ym), value: byMonth.get(ym) ?? 0 })),
          collectionRate: total ? (Number(billed._sum.amountPaid ?? 0) / total) * 100 : null,
        };
      })()
    : null;

  const exams = can(ctx, "results.view")
    ? await (async () => {
        const exam = await ctx.db.exam.findFirst({ where: { AND: [examScope(ctx), { status: "PUBLISHED" }] }, orderBy: { startDate: "desc" }, select: { id: true, name: true } });
        if (!exam) return null;
        const results = await ctx.db.result.findMany({
          where: { examId: exam.id, status: { not: "INCOMPLETE" }, student: sectionWhere },
          select: { status: true, percentage: true, student: { select: { classId: true, class: { select: { name: true, level: true, campus: { select: { code: true } } } } } } },
        });
        const byClass = new Map<string, { label: string; level: number; pass: number; n: number; pct: number }>();
        for (const r of results) {
          if (!r.student.classId || !r.student.class) continue;
          const c = byClass.get(r.student.classId) ?? { label: `${r.student.class.name}${multiCampus ? ` · ${r.student.class.campus.code}` : ""}`, level: r.student.class.level, pass: 0, n: 0, pct: 0 };
          c.n++;
          c.pct += Number(r.percentage);
          if (r.status === "PASS") c.pass++;
          byClass.set(r.student.classId, c);
        }
        const n = results.length;
        return {
          exam: exam.name,
          passRate: n ? (results.filter((r) => r.status === "PASS").length / n) * 100 : null,
          average: n ? results.reduce((a, r) => a + Number(r.percentage), 0) / n : null,
          byClass: [...byClass.entries()].map(([id, c]) => ({ id, label: c.label, value: (c.pass / c.n) * 100, hint: `${c.n}`, level: c.level })).sort((a, b) => a.value - b.value),
        };
      })()
    : null;

  const enrollment = can(ctx, "students.view")
    ? await (async () => {
        const rows = await ctx.db.student.groupBy({ by: ["classId"], where: { ...sectionWhere, status: "ACTIVE", archivedAt: null, classId: { not: null } }, _count: true });
        const classes = await ctx.db.class.findMany({ where: { id: { in: rows.map((r) => r.classId!) } }, select: { id: true, name: true, level: true, campus: { select: { code: true } } } });
        const total = rows.reduce((n, r) => n + r._count, 0);
        return {
          total,
          byClass: classes
            .sort((a, b) => a.level - b.level || a.name.localeCompare(b.name))
            .map((c) => ({ id: c.id, label: `${c.name}${multiCampus ? ` · ${c.campus.code}` : ""}`, value: rows.find((r) => r.classId === c.id)?._count ?? 0 })),
        };
      })()
    : null;

  return { months: months.map(monthLabel), threshold: ctx.settings.attendance.lowAttendanceThreshold, attendance, fees, exams, enrollment };
}
