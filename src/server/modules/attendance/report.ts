import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { campusScope, type TenantContext } from "@/server/auth/context";
import { accessibleSectionIds } from "@/server/modules/academics/scope";
import { dateOnly, toDateString } from "@/lib/format";
import { studentRates } from "./insights";
import { attendanceRate } from "./stats";

export type AttendanceReportParams = { from: string; to: string; classId?: string | null; sectionId?: string | null };

async function scopeFor(ctx: TenantContext, p: AttendanceReportParams) {
  const allowed = await accessibleSectionIds(ctx);
  const sectionFilter: Prisma.SectionWhereInput = {
    deletedAt: null,
    ...campusScope(ctx),
    ...(allowed ? { id: { in: allowed } } : {}),
    ...(p.classId ? { classId: p.classId } : {}),
    ...(p.sectionId ? { id: p.sectionId } : {}),
  };
  if (allowed && p.sectionId && !allowed.includes(p.sectionId)) sectionFilter.id = "00000000-0000-0000-0000-000000000000";
  const sections = await ctx.db.section.findMany({
    where: sectionFilter,
    orderBy: [{ class: { level: "asc" } }, { name: "asc" }],
    select: { id: true, name: true, campusId: true, campus: { select: { name: true, code: true } }, class: { select: { name: true } }, _count: { select: { students: { where: { status: "ACTIVE", archivedAt: null } } } } },
  });
  return sections;
}

export async function attendanceReport(ctx: TenantContext, p: AttendanceReportParams) {
  const sections = await scopeFor(ctx, p);
  const ids = sections.map((s) => s.id);
  const range = { gte: dateOnly(p.from), lte: dateOnly(p.to) };
  const [bySection, byDay, rates] = await Promise.all([
    ctx.db.attendance.groupBy({ by: ["sectionId", "status"], where: { sectionId: { in: ids }, date: range }, _count: { _all: true } }),
    ctx.db.attendance.groupBy({ by: ["date", "status"], where: { sectionId: { in: ids }, date: range }, _count: { _all: true }, orderBy: { date: "asc" } }),
    studentRates(ctx.db, { from: p.from, to: p.to, where: { sectionId: { in: ids } } }),
  ]);

  const tally = () => ({ present: 0, absent: 0, late: 0, leave: 0 });
  const sectionCounts = new Map<string, ReturnType<typeof tally>>();
  for (const r of bySection) {
    const c = sectionCounts.get(r.sectionId) ?? tally();
    c[r.status.toLowerCase() as keyof ReturnType<typeof tally>] += r._count._all;
    sectionCounts.set(r.sectionId, c);
  }
  const dayCounts = new Map<string, ReturnType<typeof tally>>();
  for (const r of byDay) {
    const key = toDateString(r.date);
    const c = dayCounts.get(key) ?? tally();
    c[r.status.toLowerCase() as keyof ReturnType<typeof tally>] += r._count._all;
    dayCounts.set(key, c);
  }
  const totals = [...sectionCounts.values()].reduce((acc, c) => ({ present: acc.present + c.present, absent: acc.absent + c.absent, late: acc.late + c.late, leave: acc.leave + c.leave }), tally());

  const multiCampus = new Set(sections.map((s) => s.campusId)).size > 1;
  return {
    params: p,
    totals: { ...totals, rate: attendanceRate(totals), schoolDays: dayCounts.size, students: sections.reduce((n, s) => n + s._count.students, 0) },
    sections: sections.map((s) => {
      const c = sectionCounts.get(s.id) ?? tally();
      return { id: s.id, label: `${s.class.name} — ${s.name}${multiCampus ? ` · ${s.campus.code}` : ""}`, students: s._count.students, ...c, rate: attendanceRate(c) };
    }),
    trend: [...dayCounts.entries()].map(([date, c]) => ({ date, ...c, rate: attendanceRate(c) })),
    students: rates,
  };
}

export async function attendanceReportRows(ctx: TenantContext, p: AttendanceReportParams) {
  const report = await attendanceReport(ctx, p);
  return report.students.map((s) => ({
    "Admission No": s.admissionNo,
    Student: s.name,
    "Class & Section": s.section ?? "",
    Present: s.counts.present,
    Late: s.counts.late,
    Absent: s.counts.absent,
    Leave: s.counts.leave,
    "Days Recorded": s.days,
    "Attendance %": s.rate === null ? "" : s.rate.toFixed(1),
  }));
}
