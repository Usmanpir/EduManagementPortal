import "server-only";
import { db } from "@/server/db/client";
import { tenantDb } from "@/server/db/tenant";
import { lowAttendanceStudents } from "@/server/modules/attendance/insights";
import { fanout, guardianRecipients, type Recipient } from "@/server/modules/communication/fanout";
import { usersWithPermission } from "@/server/modules/communication/notifications";
import { addDays, formatMoney, formatNumber } from "@/lib/format";
import type { OrgTask } from "../types";

/** ISO week label, e.g. "2026-W40" — alerts repeat at most once per week. */
function isoWeek(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Afternoon check: students below the attendance threshold this academic year. */
export const lowAttendanceAlerts: OrgTask = {
  name: "low-attendance-alerts",
  hour: 16,
  async run({ org, today, settings }) {
    const tdb = tenantDb(org.id);
    const year = await tdb.academicYear.findFirst({ where: { isCurrent: true } });
    const from = year ? year.startDate.toISOString().slice(0, 10) : addDays(today, -60);
    const threshold = settings.attendance.lowAttendanceThreshold;
    const low = await lowAttendanceStudents(tdb, { from, to: today, threshold, minDays: 10 });
    if (low.length === 0) return;
    const week = isoWeek(today);
    const recipients = settings.attendance.alertRecipients;
    const guardians = recipients.guardian ? await guardianRecipients(org.id, low.map((s) => s.studentId)) : new Map<string, Recipient[]>();
    const extra = await tdb.student.findMany({
      where: { id: { in: low.map((s) => s.studentId) } },
      select: { id: true, userId: true, section: { select: { classTeacher: { select: { userId: true } } } } },
    });
    const byId = new Map(extra.map((e) => [e.id, e]));
    for (const s of low) {
      const list: Recipient[] = [...(guardians.get(s.studentId) ?? [])];
      const e = byId.get(s.studentId);
      if (recipients.student && e?.userId) list.push({ userId: e.userId });
      if (recipients.classTeacher && e?.section?.classTeacher?.userId) list.push({ userId: e.section.classTeacher.userId });
      const pct = Math.round(s.rate ?? 0);
      await fanout(org.id, list, {
        type: "attendance.low",
        title: "Low attendance",
        body: `${s.name}'s attendance is ${pct}%, below the required ${threshold}%.`,
        link: `/students/${s.studentId}`,
        entityType: "student",
        entityId: s.studentId,
        template: "low_attendance",
        payload: { studentName: s.name, percentage: pct, threshold },
        dedupeKey: `low-attendance:${s.studentId}:${week}`,
      });
    }
  },
};

/** End-of-day summary for administrators. */
export const dailySummary: OrgTask = {
  name: "daily-summary",
  hour: 17,
  async run({ org, today, settings }) {
    if (!settings.notifications.dailySummaryToAdmins) return;
    if (settings.attendance.weeklyOffDays.includes(new Date(`${today}T00:00:00Z`).getUTCDay() || 7)) return;
    const tdb = tenantDb(org.id);
    const date = new Date(`${today}T00:00:00Z`);
    const [sessions, sections, collected] = await Promise.all([
      tdb.attendanceSession.aggregate({ where: { date, slot: "DAY" }, _sum: { presentCount: true, absentCount: true, lateCount: true } }),
      tdb.section.count({ where: { deletedAt: null, class: { deletedAt: null }, students: { some: { status: "ACTIVE", archivedAt: null } } } }),
      tdb.payment.aggregate({ where: { status: "COMPLETED", paidAt: { gte: date, lt: new Date(date.getTime() + 86_400_000) } }, _sum: { amount: true } }),
    ]);
    const submitted = await tdb.attendanceSession.count({ where: { date, slot: "DAY", submittedAt: { not: null } } });
    const present = sessions._sum.presentCount ?? 0;
    const absent = sessions._sum.absentCount ?? 0;
    const late = sessions._sum.lateCount ?? 0;
    const counted = present + absent + late;
    const rate = counted ? Math.round(((present + late) / counted) * 100) : 0;
    const admins = await usersWithPermission(org.id, ["settings.manage"]);
    const users = await db.user.findMany({ where: { id: { in: admins } }, select: { id: true, email: true } });
    await fanout(
      org.id,
      users.map((u) => ({ userId: u.id, email: u.email })),
      {
        type: "system",
        title: "Today at a glance",
        body: `${rate}% attendance · ${formatNumber(absent)} absent · ${Math.max(0, sections - submitted)} registers not submitted.`,
        link: "/attendance",
        template: "daily_summary",
        payload: {
          date: today,
          present,
          absent,
          late,
          rate,
          pendingSections: Math.max(0, sections - submitted),
          collected: formatMoney(Number(collected._sum.amount ?? 0), org.currency),
        },
        dedupeKey: `daily-summary:${org.id}:${today}`,
      },
    );
  },
};
