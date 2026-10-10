import "server-only";
import { campusScope, can, type TenantContext } from "@/server/auth/context";
import { visibleWhere } from "@/server/modules/communication/announcements";
import { attendanceOverview, attendanceTrend } from "@/server/modules/attendance/register";
import { examScope } from "@/server/modules/exams/service";
import { myPapers } from "@/server/modules/exams/marks";
import { financeOverview } from "@/server/modules/finance/overview";
import { teacherDay } from "@/server/modules/timetable/service";
import { dateOnly, todayIn, toDateString } from "@/lib/format";

/**
 * Everything the staff dashboard shows, each block only when the user has
 * the permission for it — a teacher, accountant and principal each get a
 * different page from the same code.
 */
export async function staffDashboard(ctx: TenantContext) {
  const today = todayIn(ctx.organization.timezone);
  const scope = campusScope(ctx);
  const full = can(ctx, "records.all");

  const [attendance, trend, lessons, papers, finance, pendingLeave, pendingCorrections, nextExam, announcements, counts] = await Promise.all([
    can(ctx, "attendance.view") || can(ctx, "attendance.mark") ? attendanceOverview(ctx, today) : null,
    can(ctx, "attendance.view") && full ? attendanceTrend(ctx, 14) : null,
    ctx.teacherId ? teacherDay(ctx, ctx.teacherId, today) : null,
    can(ctx, "marks.enter") && !full ? myPapers(ctx) : null,
    can(ctx, "payments.view") ? financeOverview(ctx) : null,
    can(ctx, "leave.review") ? ctx.db.leaveRequest.count({ where: { status: "PENDING" } }) : null,
    can(ctx, "attendance.edit") ? ctx.db.attendanceCorrection.count({ where: { status: "PENDING", attendance: scope } }) : null,
    can(ctx, "exams.view")
      ? ctx.db.exam.findFirst({ where: { AND: [examScope(ctx), { status: { in: ["SCHEDULED", "DRAFT"] }, endDate: { gte: dateOnly(today) } }] }, orderBy: { startDate: "asc" }, select: { id: true, name: true, startDate: true, endDate: true, status: true } })
      : null,
    can(ctx, "announcements.view")
      ? ctx.db.announcement.findMany({
          where: { AND: [await visibleWhere(ctx), { status: "PUBLISHED" }] },
          orderBy: [{ isPinned: "desc" }, { publishedAt: "desc" }],
          take: 3,
          select: { id: true, title: true, body: true, publishedAt: true, isPinned: true },
        })
      : null,
    full
      ? Promise.all([
          ctx.db.student.count({ where: { ...scope, status: "ACTIVE", archivedAt: null } }),
          ctx.db.teacher.count({ where: { staff: { ...scope, deletedAt: null, status: "ACTIVE" } } }),
          ctx.db.staff.count({ where: { ...scope, deletedAt: null, status: "ACTIVE" } }),
          ctx.db.class.count({ where: { ...scope, deletedAt: null } }),
        ])
      : null,
  ]);

  // The overview is already limited to sections the user can access; in period mode a teacher sees their own periods.
  const registers = attendance ? attendance.items.filter((i) => full || attendance.mode === "DAILY" || i.mine) : [];
  const s = attendance?.summary;
  const counted = s ? s.present + s.late + s.absent : 0;
  return {
    today,
    attendance: attendance && {
      isOffDay: attendance.isOffDay,
      mode: attendance.mode,
      rate: counted ? ((s!.present + s!.late) / counted) * 100 : null,
      present: s!.present + s!.late,
      absent: s!.absent,
      late: s!.late,
      students: s!.students,
      registers: registers.length,
      submitted: registers.filter((r) => r.submitted).length,
      pending: registers
        .filter((r) => !r.submitted)
        .sort((a, b) => (a.startMinute ?? 0) - (b.startMinute ?? 0))
        .slice(0, 6)
        .map((r) => ({ key: r.key, sectionId: r.sectionId, periodId: r.periodId, label: r.label, subject: r.subject, time: r.time, students: r.students })),
    },
    trend,
    lessons,
    // Only papers that have been sat (dated today or earlier) are due for marking.
    marks: papers && {
      total: papers.length,
      incomplete: papers.filter((p) => p.date && p.date <= today && p.students > 0 && p.entered < p.students).length,
    },
    finance: finance && { today: finance.today, month: finance.month, outstanding: finance.outstanding, overdue: finance.overdue, overdueCount: finance.overdueCount },
    pendingLeave,
    pendingCorrections,
    nextExam: nextExam && { id: nextExam.id, name: nextExam.name, from: toDateString(nextExam.startDate), to: toDateString(nextExam.endDate), draft: nextExam.status === "DRAFT" },
    announcements: announcements?.map((a) => ({ id: a.id, title: a.title, body: a.body, isPinned: a.isPinned, publishedAt: a.publishedAt?.toISOString() ?? null })) ?? null,
    counts: counts && { students: counts[0], teachers: counts[1], staff: counts[2], classes: counts[3] },
  };
}
