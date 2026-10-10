import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { TenantDb } from "@/server/db/tenant";
import { dateOnly } from "@/lib/format";
import { attendanceRate, emptyCounts, type AttendanceCounts } from "./stats";

export type StudentRate = {
  studentId: string;
  name: string;
  admissionNo: string;
  sectionId: string | null;
  section: string | null;
  counts: AttendanceCounts;
  rate: number | null;
  days: number;
};

/**
 * Attendance rate per student over a date range. Only students with at least
 * `minDays` recorded days are rated, so new admissions aren't flagged.
 */
export async function studentRates(
  db: TenantDb,
  opts: { from: string; to: string; where?: Prisma.StudentWhereInput; minDays?: number },
): Promise<StudentRate[]> {
  const students = await db.student.findMany({
    where: { status: "ACTIVE", archivedAt: null, ...opts.where },
    select: { id: true, firstName: true, lastName: true, admissionNo: true, sectionId: true, section: { select: { name: true, class: { select: { name: true } } } } },
  });
  if (students.length === 0) return [];
  const groups = await db.attendance.groupBy({
    by: ["studentId", "status"],
    where: { studentId: { in: students.map((s) => s.id) }, date: { gte: dateOnly(opts.from), lte: dateOnly(opts.to) } },
    _count: { _all: true },
  });
  const counts = new Map<string, AttendanceCounts>();
  for (const g of groups) {
    const c = counts.get(g.studentId) ?? emptyCounts();
    c[g.status.toLowerCase() as keyof AttendanceCounts] += g._count._all;
    counts.set(g.studentId, c);
  }
  return students
    .map((s) => {
      const c = counts.get(s.id) ?? emptyCounts();
      const days = c.present + c.absent + c.late;
      return {
        studentId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        admissionNo: s.admissionNo,
        sectionId: s.sectionId,
        section: s.section ? `${s.section.class.name} — ${s.section.name}` : null,
        counts: c,
        rate: days >= (opts.minDays ?? 1) ? attendanceRate(c) : null,
        days,
      };
    })
    .sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101));
}

export async function lowAttendanceStudents(db: TenantDb, opts: { from: string; to: string; threshold: number; where?: Prisma.StudentWhereInput; minDays?: number }) {
  return (await studentRates(db, { ...opts, minDays: opts.minDays ?? 5 })).filter((s) => s.rate !== null && s.rate < opts.threshold);
}
