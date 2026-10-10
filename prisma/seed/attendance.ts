import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { addDays, dateOnly, isoWeekday, todayIn } from "@/lib/format";
import type { DemoContext } from "./demo";
import { createRandom } from "./random";

const r = createRandom(7);
type Status = "PRESENT" | "ABSENT" | "LATE" | "LEAVE";

export async function seedAttendance(ctx: DemoContext) {
  const orgId = ctx.orgId;
  if ((await db.attendanceSession.count({ where: { organizationId: orgId } })) > 0) return;

  const today = todayIn("Asia/Karachi");
  const days: string[] = [];
  for (let i = 1; days.length < 25; i++) {
    const d = addDays(today, -i);
    if (isoWeekday(d) !== 7) days.push(d);
  }
  days.reverse();

  const sections = await db.section.findMany({
    where: { organizationId: orgId, deletedAt: null },
    include: { students: { where: { status: "ACTIVE" }, select: { id: true, firstName: true, lastName: true } }, classTeacher: { select: { userId: true } }, campus: { select: { code: true } }, class: { select: { name: true } } },
  });
  // Each student has their own attendance habit.
  const habit = new Map<string, number>();
  for (const s of sections) for (const st of s.students) habit.set(st.id, r.chance(0.06) ? 0.62 + r.next() * 0.12 : r.chance(0.15) ? 0.82 + r.next() * 0.08 : 0.92 + r.next() * 0.075);

  const markers = (await db.userRole.findMany({ where: { organizationId: orgId, role: { key: "admin" } }, select: { userId: true } })).map((u) => u.userId);
  let sessions = 0;
  let records: Prisma.AttendanceCreateManyInput[] = [];

  const flush = async () => {
    if (records.length) await db.attendance.createMany({ data: records });
    records = [];
  };

  const takeRegister = async (section: (typeof sections)[number], date: string, partial = false) => {
    const statuses: [string, Status][] = section.students.map((st) => {
      const p = habit.get(st.id)!;
      const roll = r.next();
      const status: Status = roll < p ? (r.chance(0.05) ? "LATE" : "PRESENT") : r.chance(0.12) ? "LEAVE" : "ABSENT";
      return [st.id, status];
    });
    if (partial) return;
    const c = { PRESENT: 0, ABSENT: 0, LATE: 0, LEAVE: 0 };
    for (const [, s] of statuses) c[s]++;
    const session = await db.attendanceSession.create({
      data: {
        organizationId: orgId,
        campusId: section.campusId,
        sectionId: section.id,
        date: dateOnly(date),
        slot: "DAY",
        takenById: section.classTeacher?.userId ?? markers[0] ?? null,
        submittedAt: new Date(`${date}T03:${String(r.int(5, 40)).padStart(2, "0")}:00Z`),
        presentCount: c.PRESENT,
        absentCount: c.ABSENT,
        lateCount: c.LATE,
        leaveCount: c.LEAVE,
      },
    });
    sessions++;
    for (const [studentId, status] of statuses) {
      records.push({
        organizationId: orgId,
        campusId: section.campusId,
        sessionId: session.id,
        studentId,
        sectionId: section.id,
        date: dateOnly(date),
        slot: "DAY",
        status,
        note: status === "LATE" && r.chance(0.3) ? r.pick(["Traffic", "Van was late", "Doctor's appointment"]) : null,
        markedById: session.takenById,
      });
    }
    if (records.length > 5000) await flush();
  };

  for (const date of days) for (const s of sections) await takeRegister(s, date);
  // Today: most registers are in; Grade 10-A at Islamabad (Sara's class) is still pending for the demo.
  for (const s of sections) {
    const isDemo = s.campus.code === "ISB" && s.class.name === "Grade 10" && s.name === "A";
    if (!isDemo && r.chance(0.7)) await takeRegister(s, today);
  }
  await flush();

  // Staff attendance for the same days.
  const staff = await db.staff.findMany({ where: { organizationId: orgId, deletedAt: null }, select: { id: true, campusId: true } });
  const staffRows: Prisma.StaffAttendanceCreateManyInput[] = [];
  for (const date of [...days, today]) {
    for (const s of staff) {
      if (date === today && r.chance(0.25)) continue;
      const roll = r.next();
      const status = roll < 0.88 ? "PRESENT" : roll < 0.95 ? "LATE" : roll < 0.98 ? "LEAVE" : "ABSENT";
      // Relative to the 08:15 PKT (03:15 UTC) late cut-off.
      const minute = status === "LATE" ? r.int(1, 35) : r.int(-40, -1);
      const checkIn = status === "PRESENT" || status === "LATE" ? new Date(new Date(`${date}T03:15:00Z`).getTime() + minute * 60_000) : null;
      staffRows.push({
        organizationId: orgId,
        campusId: s.campusId,
        staffId: s.id,
        date: dateOnly(date),
        status,
        checkInAt: checkIn,
        checkOutAt: checkIn && date !== today ? new Date(checkIn.getTime() + (7 + r.next()) * 3_600_000) : null,
        source: r.chance(0.6) ? "QR" : "MANUAL",
      });
    }
  }
  await db.staffAttendance.createMany({ data: staffRows, skipDuplicates: true });

  // A few leave requests in different states.
  const someStudents = sections.flatMap((s) => s.students.slice(0, 1).map((st) => ({ ...st, campusId: s.campusId }))).slice(0, 6);
  const requester = ctx.users.parent ?? markers[0]!;
  const leaves: Prisma.LeaveRequestCreateManyInput[] = someStudents.map((st, i) => ({
    organizationId: orgId,
    campusId: st.campusId,
    requesterType: "STUDENT" as const,
    studentId: st.id,
    type: i % 2 ? "SICK" : "CASUAL",
    startDate: dateOnly(addDays(today, i < 3 ? 1 + i : -3 - i)),
    endDate: dateOnly(addDays(today, i < 3 ? 2 + i : -2 - i)),
    reason: i % 2 ? "Fever — doctor advised rest." : "Family wedding out of city.",
    status: i < 3 ? "PENDING" : "APPROVED",
    requestedById: requester,
    reviewedById: i < 3 ? null : markers[0],
    reviewedAt: i < 3 ? null : new Date(),
  }));
  const someStaff = staff.slice(3, 5);
  for (const [i, s] of someStaff.entries()) {
    leaves.push({
      organizationId: orgId,
      campusId: s.campusId,
      requesterType: "STAFF",
      staffId: s.id,
      type: i ? "ANNUAL" : "SICK",
      startDate: dateOnly(addDays(today, 2 + i * 5)),
      endDate: dateOnly(addDays(today, 3 + i * 5)),
      reason: i ? "Annual leave — family visit." : "Medical appointment.",
      status: "PENDING",
      requestedById: markers[0]!,
    });
  }
  await db.leaveRequest.createMany({ data: leaves });

  const total = await db.attendance.count({ where: { organizationId: orgId } });
  console.log(`• Attendance: ${sessions} registers, ${total} student records, ${staffRows.length} staff records, ${leaves.length} leave requests`);
}
