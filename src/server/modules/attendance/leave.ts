import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { can, campusScope, type TenantContext } from "@/server/auth/context";
import { badRequest, conflict, forbidden, notFound } from "@/server/http/errors";
import { accessibleSectionIds } from "@/server/modules/academics/scope";
import { fanout, guardianRecipients, type Recipient } from "@/server/modules/communication/fanout";
import { notifyUsers, usersWithPermission } from "@/server/modules/communication/notifications";
import { findAccessibleStudent } from "@/server/modules/people/students";
import { dateOnly, formatDate, toDateString } from "@/lib/format";
import type { leaveRequestSchema } from "@/lib/validation/attendance";
import { nameMatch } from "@/server/db/search";

export type LeaveListParams = { status?: string[]; requesterType?: string[]; q?: string; mine?: boolean; page: number; pageSize: number };

/** Who may see a leave request: reviewers (in scope), the requester, or the person/guardian it's for. */
async function leaveVisibility(ctx: TenantContext): Promise<Prisma.LeaveRequestWhereInput> {
  const own: Prisma.LeaveRequestWhereInput[] = [{ requestedById: ctx.user.id }];
  if (ctx.staffId) own.push({ staffId: ctx.staffId });
  if (ctx.studentId) own.push({ studentId: ctx.studentId });
  if (ctx.guardianId) own.push({ student: { guardians: { some: { guardianId: ctx.guardianId } } } });
  if (!can(ctx, "leave.review") && !can(ctx, "leave.view")) return { OR: own };
  const sections = await accessibleSectionIds(ctx);
  const staffScope: Prisma.LeaveRequestWhereInput = can(ctx, "leave.review") && can(ctx, "staff.view") ? { requesterType: "STAFF" } : { id: "00000000-0000-0000-0000-000000000000" };
  const studentScope: Prisma.LeaveRequestWhereInput = { requesterType: "STUDENT", ...(sections ? { student: { sectionId: { in: sections } } } : {}) };
  return { OR: [...own, { AND: [campusScope(ctx), { OR: [staffScope, studentScope] }] }] };
}

export async function listLeave(ctx: TenantContext, params: LeaveListParams) {
  const visibility = await leaveVisibility(ctx);
  const where: Prisma.LeaveRequestWhereInput = {
    AND: [
      visibility,
      params.mine ? { requestedById: ctx.user.id } : {},
      params.status?.length ? { status: { in: params.status as ("PENDING" | "APPROVED" | "REJECTED" | "CANCELLED")[] } } : {},
      params.requesterType?.length ? { requesterType: { in: params.requesterType as ("STUDENT" | "STAFF")[] } } : {},
      params.q
        ? {
            OR: [
              { student: nameMatch(params.q) },
              { staff: nameMatch(params.q) },
            ],
          }
        : {},
    ],
  };
  const [rows, total, pending] = await Promise.all([
    ctx.db.leaveRequest.findMany({
      where,
      orderBy: [{ status: "asc" }, { startDate: "desc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        student: { select: { id: true, firstName: true, lastName: true, section: { select: { name: true, class: { select: { name: true } } } } } },
        staff: { select: { id: true, firstName: true, lastName: true, designation: true } },
      },
    }),
    ctx.db.leaveRequest.count({ where }),
    ctx.db.leaveRequest.count({ where: { AND: [visibility, { status: "PENDING" }] } }),
  ]);
  const userIds = [...new Set(rows.flatMap((r) => [r.requestedById, r.reviewedById]).filter((x): x is string => !!x))];
  const users = userIds.length ? await ctx.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  return {
    total,
    pending,
    rows: rows.map((r) => ({
      id: r.id,
      requesterType: r.requesterType,
      personId: r.student?.id ?? r.staff?.id ?? null,
      person: r.student ? `${r.student.firstName} ${r.student.lastName}` : r.staff ? `${r.staff.firstName} ${r.staff.lastName}` : "—",
      detail: r.student ? (r.student.section ? `${r.student.section.class.name} — ${r.student.section.name}` : "Student") : (r.staff?.designation ?? "Staff"),
      type: r.type,
      startDate: toDateString(r.startDate),
      endDate: toDateString(r.endDate),
      days: Math.round((r.endDate.getTime() - r.startDate.getTime()) / 86_400_000) + 1,
      reason: r.reason,
      status: r.status,
      requestedBy: names.get(r.requestedById) ?? "Former user",
      mine: r.requestedById === ctx.user.id,
      reviewedBy: r.reviewedById ? (names.get(r.reviewedById) ?? "Former user") : null,
      reviewNote: r.reviewNote,
      createdAt: r.createdAt.toISOString(),
      canReview: r.status === "PENDING" && can(ctx, "leave.review") && r.requestedById !== ctx.user.id,
      canCancel: r.status === "PENDING" && r.requestedById === ctx.user.id,
    })),
  };
}

export async function createLeave(ctx: TenantContext, input: z.output<typeof leaveRequestSchema>) {
  let campusId: string;
  let personName: string;
  if (input.requesterType === "STAFF") {
    const staffId = input.staffId ?? ctx.staffId;
    if (!staffId) throw badRequest("Your account isn't linked to a staff record, so you can't request staff leave.");
    if (staffId !== ctx.staffId && !can(ctx, "leave.review")) throw forbidden("You can only request leave for yourself.");
    const staff = await ctx.db.staff.findFirst({ where: { id: staffId, deletedAt: null, ...(staffId !== ctx.staffId ? campusScope(ctx) : {}) }, select: { campusId: true, firstName: true, lastName: true } });
    if (!staff) throw notFound("Staff member");
    campusId = staff.campusId;
    personName = `${staff.firstName} ${staff.lastName}`;
    input = { ...input, staffId, studentId: null };
  } else {
    const studentId = input.studentId!;
    let student: { campusId: string; firstName: string; lastName: string } | null = null;
    if (ctx.guardianId) {
      student = await ctx.db.student.findFirst({ where: { id: studentId, archivedAt: null, guardians: { some: { guardianId: ctx.guardianId } } }, select: { campusId: true, firstName: true, lastName: true } });
    }
    if (!student && ctx.studentId === studentId) {
      student = await ctx.db.student.findFirst({ where: { id: studentId }, select: { campusId: true, firstName: true, lastName: true } });
    }
    if (!student && (can(ctx, "leave.review") || can(ctx, "attendance.mark"))) student = await findAccessibleStudent(ctx, studentId);
    if (!student) throw notFound("Student");
    campusId = student.campusId;
    personName = `${student.firstName} ${student.lastName}`;
    input = { ...input, staffId: null };
  }

  const overlap = await ctx.db.leaveRequest.findFirst({
    where: {
      status: { in: ["PENDING", "APPROVED"] },
      ...(input.requesterType === "STAFF" ? { staffId: input.staffId } : { studentId: input.studentId }),
      startDate: { lte: dateOnly(input.endDate) },
      endDate: { gte: dateOnly(input.startDate) },
    },
    select: { id: true },
  });
  if (overlap) throw conflict("There's already a leave request covering some of these dates.", { startDate: "Overlaps an existing request." });

  const leave = await ctx.db.leaveRequest.create({
    data: {
      organizationId: ctx.orgId,
      campusId,
      requesterType: input.requesterType,
      studentId: input.studentId,
      staffId: input.staffId,
      type: input.type,
      startDate: dateOnly(input.startDate),
      endDate: dateOnly(input.endDate),
      reason: input.reason,
      requestedById: ctx.user.id,
    },
  });
  await auditFor(ctx)({ action: "leave.request", entityType: "leave", entityId: leave.id, after: input });

  const reviewers = (await usersWithPermission(ctx.orgId, ["leave.review"], campusId)).filter((id) => id !== ctx.user.id);
  await notifyUsers(
    ctx.orgId,
    reviewers.map((userId) => ({
      userId,
      type: "leave.requested" as const,
      title: "New leave request",
      body: `${personName} · ${formatDate(input.startDate, "dayMonth")}${input.endDate !== input.startDate ? ` – ${formatDate(input.endDate, "dayMonth")}` : ""}`,
      link: "/attendance/leave?status=PENDING",
      entityType: "leave",
      entityId: leave.id,
      dedupeKey: `leave-request:${leave.id}`,
    })),
  );
  return leave;
}

export async function reviewLeave(ctx: TenantContext, id: string, decision: "APPROVED" | "REJECTED", note: string | null) {
  const visibility = await leaveVisibility(ctx);
  const leave = await ctx.db.leaveRequest.findFirst({
    where: { AND: [visibility, { id, status: "PENDING" }] },
    include: { student: { select: { firstName: true, lastName: true } }, staff: { select: { firstName: true, lastName: true, userId: true } } },
  });
  if (!leave) throw notFound("Leave request");
  if (leave.requestedById === ctx.user.id) throw forbidden("Someone else needs to review your own request.");

  await ctx.db.$transaction(async (tx) => {
    await tx.leaveRequest.update({ where: { id }, data: { status: decision, reviewedById: ctx.user.id, reviewedAt: new Date(), reviewNote: note } });
    if (decision !== "APPROVED") return;
    const range = { gte: leave.startDate, lte: leave.endDate };
    // Absences already recorded in the leave period become excused leave.
    if (leave.studentId) {
      const absences = await tx.attendance.findMany({ where: { studentId: leave.studentId, date: range, status: "ABSENT" }, select: { id: true, sessionId: true } });
      if (absences.length) {
        await tx.attendance.updateMany({ where: { id: { in: absences.map((a) => a.id) } }, data: { status: "LEAVE" } });
        for (const sessionId of new Set(absences.map((a) => a.sessionId))) {
          const n = absences.filter((a) => a.sessionId === sessionId).length;
          await tx.attendanceSession.update({ where: { id: sessionId }, data: { absentCount: { decrement: n }, leaveCount: { increment: n } } });
        }
      }
    } else if (leave.staffId) {
      await tx.staffAttendance.updateMany({ where: { staffId: leave.staffId, date: range, status: "ABSENT" }, data: { status: "LEAVE" } });
    }
  });
  await auditFor(ctx)({ action: decision === "APPROVED" ? "leave.approve" : "leave.reject", entityType: "leave", entityId: id, metadata: { note } });

  const personName = leave.student ? `${leave.student.firstName} ${leave.student.lastName}` : `${leave.staff?.firstName} ${leave.staff?.lastName}`;
  const dates = `${formatDate(toDateString(leave.startDate), "dayMonth")}${leave.endDate.getTime() !== leave.startDate.getTime() ? ` – ${formatDate(toDateString(leave.endDate), "dayMonth")}` : ""}`;
  const verb = decision === "APPROVED" ? "approved" : "rejected";
  const recipients: Recipient[] = [{ userId: leave.requestedById }];
  if (leave.staff?.userId && leave.staff.userId !== leave.requestedById) recipients.push({ userId: leave.staff.userId });
  if (leave.studentId) recipients.push(...((await guardianRecipients(ctx.orgId, [leave.studentId])).get(leave.studentId) ?? []));
  await fanout(ctx.orgId, recipients, {
    type: "leave.reviewed",
    title: `Leave ${verb}`,
    body: `Leave for ${personName} (${dates}) was ${verb}${note ? `: ${note}` : "."}`,
    link: "/attendance/leave",
    entityType: "leave",
    entityId: id,
    template: "leave_reviewed",
    payload: { personName, dates, decision: verb, note },
    dedupeKey: `leave-review:${id}`,
  });
}

export async function cancelLeave(ctx: TenantContext, id: string) {
  const result = await ctx.db.leaveRequest.updateMany({ where: { id, requestedById: ctx.user.id, status: "PENDING" }, data: { status: "CANCELLED" } });
  if (result.count === 0) throw notFound("Leave request");
  await auditFor(ctx)({ action: "leave.cancel", entityType: "leave", entityId: id });
}

/** People the current user may file leave for (for the request form). */
export async function leaveSubjects(ctx: TenantContext) {
  const children = ctx.guardianId
    ? await ctx.db.student.findMany({ where: { archivedAt: null, guardians: { some: { guardianId: ctx.guardianId } } }, select: { id: true, firstName: true, lastName: true } })
    : [];
  return {
    self: ctx.staffId ? { staffId: ctx.staffId } : null,
    children: children.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}` })),
    canFileForOthers: can(ctx, "leave.review") || can(ctx, "attendance.mark"),
  };
}
