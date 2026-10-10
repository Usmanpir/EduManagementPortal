import "server-only";
import type { TenantDb } from "@/server/db/tenant";

export type AttendanceCounts = { present: number; absent: number; late: number; leave: number };

/**
 * Attendance rate used everywhere in EduAttend: late counts as attended,
 * approved leave is excused and excluded from the denominator.
 */
export function attendanceRate(c: AttendanceCounts): number | null {
  const counted = c.present + c.late + c.absent;
  return counted > 0 ? ((c.present + c.late) / counted) * 100 : null;
}

export const emptyCounts = (): AttendanceCounts => ({ present: 0, absent: 0, late: 0, leave: 0 });

/** Per-student attendance counts (optionally within a date range). */
export async function studentAttendanceCounts(db: TenantDb, studentIds: string[], range?: { from?: Date; to?: Date }) {
  const map = new Map<string, AttendanceCounts>();
  if (studentIds.length === 0) return map;
  const rows = await db.attendance.groupBy({
    by: ["studentId", "status"],
    where: {
      studentId: { in: studentIds },
      ...(range?.from || range?.to ? { date: { ...(range.from ? { gte: range.from } : {}), ...(range.to ? { lte: range.to } : {}) } } : {}),
    },
    _count: { _all: true },
  });
  for (const r of rows) {
    const c = map.get(r.studentId) ?? emptyCounts();
    const key = r.status.toLowerCase() as keyof AttendanceCounts;
    c[key] += r._count._all;
    map.set(r.studentId, c);
  }
  return map;
}
