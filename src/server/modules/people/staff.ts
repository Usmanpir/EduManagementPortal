import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { assertCampusAccess, campusScope, type TenantContext } from "@/server/auth/context";
import { destroyAllSessions } from "@/server/auth/session";
import { bumpSequenceTo, formatCode, nextSequence } from "@/server/db/sequence";
import { badRequest, conflict, notFound } from "@/server/http/errors";
import { assertWithinLimit } from "@/server/modules/billing/limits";
import { inviteUser } from "@/server/modules/users/service";
import { dateOnly } from "@/lib/format";
import type { staffSchema } from "@/lib/validation/people";
import { nameMatch } from "@/server/db/search";

type StaffIn = z.output<typeof staffSchema>;

export const EMPLOYEE_SEQ = "staff.employee";
const EMPLOYEE_PREFIX = "EMP";

export type StaffListParams = {
  q?: string;
  kind?: "teacher" | "staff" | "all";
  departmentId?: string[];
  status?: string[];
  sort?: string;
  dir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

const SORTS: Record<string, (dir: "asc" | "desc") => Prisma.StaffOrderByWithRelationInput[]> = {
  name: (dir) => [{ firstName: dir }, { lastName: dir }],
  code: (dir) => [{ employeeCode: dir }],
  joined: (dir) => [{ joiningDate: dir }],
  designation: (dir) => [{ designation: dir }],
};

function staffWhere(ctx: TenantContext, params: Omit<StaffListParams, "page" | "pageSize" | "sort" | "dir">): Prisma.StaffWhereInput {
  const statuses = params.status?.length ? params.status : ["ACTIVE", "ON_LEAVE"];
  return {
    deletedAt: null,
    ...campusScope(ctx),
    status: { in: statuses as StaffIn["status"][] },
    ...(params.kind === "teacher" ? { teacher: { isNot: null } } : {}),
    ...(params.departmentId?.length ? { departmentId: { in: params.departmentId } } : {}),
    ...(params.q
      ? {
          OR: [
            nameMatch(params.q),
            { employeeCode: { contains: params.q, mode: "insensitive" } },
            { designation: { contains: params.q, mode: "insensitive" } },
            { phone: { contains: params.q } },
            { email: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
}

export async function listStaff(ctx: TenantContext, params: StaffListParams) {
  const where = staffWhere(ctx, params);
  const orderBy = SORTS[params.sort ?? ""]?.(params.dir ?? "asc") ?? SORTS.name!("asc");
  const [rows, total] = await Promise.all([
    ctx.db.staff.findMany({
      where,
      orderBy,
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        campus: { select: { name: true } },
        department: { select: { name: true } },
        teacher: {
          select: {
            id: true,
            subjects: { select: { subject: { select: { name: true } }, section: { select: { name: true, class: { select: { name: true } } } } } },
          },
        },
        classTeacherOf: { where: { deletedAt: null }, select: { name: true, class: { select: { name: true } } } },
        user: { select: { id: true, lastLoginAt: true } },
      },
    }),
    ctx.db.staff.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((s) => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`,
      employeeCode: s.employeeCode,
      designation: s.designation,
      departmentName: s.department?.name ?? null,
      campusName: s.campus.name,
      phone: s.phone,
      email: s.email,
      status: s.status,
      photoKey: s.photoKey,
      isTeacher: !!s.teacher,
      subjects: [...new Set(s.teacher?.subjects.map((a) => a.subject.name) ?? [])],
      sections: s.teacher?.subjects.length ?? 0,
      classTeacherOf: s.classTeacherOf.map((c) => `${c.class.name}-${c.name}`),
      hasLogin: !!s.user,
    })),
  };
}

export async function getStaffProfile(ctx: TenantContext, id: string) {
  const staff = await ctx.db.staff.findFirst({
    where: { id, deletedAt: null },
    include: {
      campus: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      user: { select: { id: true, email: true, lastLoginAt: true, status: true } },
      teacher: {
        include: {
          subjects: {
            include: {
              subject: { select: { id: true, name: true, color: true } },
              section: { select: { id: true, name: true, class: { select: { id: true, name: true } }, _count: { select: { students: { where: { archivedAt: null, status: "ACTIVE" } } } } } },
            },
          },
          _count: { select: { timetableEntries: true } },
        },
      },
      classTeacherOf: {
        where: { deletedAt: null },
        select: { id: true, name: true, class: { select: { id: true, name: true } }, _count: { select: { students: { where: { archivedAt: null, status: "ACTIVE" } } } } },
      },
    },
  });
  if (!staff) return null;
  assertCampusAccess(ctx, staff.campusId);
  const pendingInvite = staff.user || !staff.email ? null : await ctx.db.invitation.findFirst({ where: { email: staff.email, acceptedAt: null, revokedAt: null }, select: { id: true, expiresAt: true } });
  return { staff, pendingInvite };
}

async function resolveEmployeeCode(ctx: TenantContext, requested: string | null, exceptId?: string) {
  if (requested) {
    const taken = await ctx.db.staff.findFirst({ where: { employeeCode: requested, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
    if (taken) throw conflict("This employee ID is already in use.", { employeeCode: "This employee ID is already in use." });
    const n = Number(/(\d+)$/.exec(requested)?.[1]);
    if (Number.isFinite(n) && requested.startsWith(`${EMPLOYEE_PREFIX}-`)) await bumpSequenceTo(ctx.orgId, EMPLOYEE_SEQ, n);
    return requested;
  }
  for (let i = 0; i < 20; i++) {
    const candidate = formatCode(EMPLOYEE_PREFIX, await nextSequence(ctx.orgId, EMPLOYEE_SEQ), 3);
    if (!(await ctx.db.staff.findFirst({ where: { employeeCode: candidate }, select: { id: true } }))) return candidate;
  }
  throw conflict("Couldn't generate a unique employee ID. Enter one manually.");
}

async function checkReferences(ctx: TenantContext, input: StaffIn) {
  assertCampusAccess(ctx, input.campusId);
  if (!(await ctx.db.campus.findFirst({ where: { id: input.campusId, deletedAt: null }, select: { id: true } }))) throw notFound("Campus");
  if (input.departmentId && !(await ctx.db.department.findFirst({ where: { id: input.departmentId, deletedAt: null }, select: { id: true } }))) {
    throw notFound("Department");
  }
  if (input.email) {
    const sameEmail = await ctx.db.staff.findFirst({ where: { email: input.email, deletedAt: null }, select: { id: true } });
    return sameEmail?.id ?? null;
  }
  return null;
}

function staffData(input: StaffIn) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    gender: input.gender,
    dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null,
    cnic: input.cnic,
    phone: input.phone,
    email: input.email,
    address: input.address,
    campusId: input.campusId,
    departmentId: input.departmentId,
    designation: input.designation,
    joiningDate: input.joiningDate ? dateOnly(input.joiningDate) : null,
    status: input.status,
  };
}

async function inviteStaff(ctx: TenantContext, email: string, isTeacher: boolean, campusId: string) {
  const role = await ctx.db.role.findFirst({ where: { key: isTeacher ? "teacher" : "staff" }, select: { id: true } });
  if (!role) return;
  await inviteUser(ctx, { email, roleId: role.id, campusId });
}

export async function createStaff(ctx: TenantContext, input: StaffIn) {
  await assertWithinLimit(ctx.orgId, "staff");
  if (input.isTeacher) await assertWithinLimit(ctx.orgId, "teachers");
  const duplicateEmail = await checkReferences(ctx, input);
  if (duplicateEmail) throw conflict("Another staff member uses this email.", { email: "Another staff member uses this email." });
  if (input.inviteToSignIn && !input.email) throw badRequest("Add an email address to send a sign-in invitation.", { email: "Required to send an invitation." });

  const employeeCode = await resolveEmployeeCode(ctx, input.employeeCode);
  const staff = await ctx.db.$transaction(async (tx) => {
    const created = await tx.staff.create({ data: { organizationId: ctx.orgId, employeeCode, ...staffData(input) } });
    if (input.isTeacher) {
      await tx.teacher.create({ data: { organizationId: ctx.orgId, staffId: created.id, qualification: input.qualification, specialization: input.specialization } });
    }
    return created;
  });
  await auditFor(ctx)({ action: input.isTeacher ? "teacher.create" : "staff.create", entityType: "staff", entityId: staff.id, after: { ...input, employeeCode } });
  if (input.inviteToSignIn && input.email) await inviteStaff(ctx, input.email, input.isTeacher, input.campusId);
  return staff;
}

export async function updateStaff(ctx: TenantContext, id: string, input: StaffIn) {
  const before = await ctx.db.staff.findFirst({ where: { id, deletedAt: null }, include: { teacher: true } });
  if (!before) throw notFound("Staff member");
  assertCampusAccess(ctx, before.campusId);
  const sameEmail = await checkReferences(ctx, input);
  if (sameEmail && sameEmail !== id) throw conflict("Another staff member uses this email.", { email: "Another staff member uses this email." });
  const employeeCode = input.employeeCode && input.employeeCode !== before.employeeCode ? await resolveEmployeeCode(ctx, input.employeeCode, id) : before.employeeCode;

  if (input.isTeacher && !before.teacher) await assertWithinLimit(ctx.orgId, "teachers");
  if (!input.isTeacher && before.teacher) {
    const assigned = await ctx.db.teacherSubject.count({ where: { teacherId: before.teacher.id } });
    if (assigned > 0) throw badRequest(`This teacher still teaches ${assigned} class subjects. Reassign them before removing the teacher role.`);
  }

  await ctx.db.$transaction(async (tx) => {
    await tx.staff.update({ where: { id }, data: { employeeCode, ...staffData(input) } });
    if (input.isTeacher) {
      await tx.teacher.upsert({
        where: { staffId: id },
        create: { organizationId: ctx.orgId, staffId: id, qualification: input.qualification, specialization: input.specialization },
        update: { qualification: input.qualification, specialization: input.specialization },
      });
    } else if (before.teacher) {
      await tx.teacher.delete({ where: { staffId: id } });
    }
  });
  await auditFor(ctx)({ action: "staff.update", entityType: "staff", entityId: id, before, after: input });
  if (input.inviteToSignIn && input.email && !before.userId) await inviteStaff(ctx, input.email, input.isTeacher, input.campusId);
}

/** Removes a staff member from active lists; their history and sign-in are retired with them. */
export async function archiveStaff(ctx: TenantContext, id: string) {
  const staff = await ctx.db.staff.findFirst({ where: { id, deletedAt: null }, include: { teacher: { select: { id: true } } } });
  if (!staff) throw notFound("Staff member");
  assertCampusAccess(ctx, staff.campusId);
  await ctx.db.$transaction(async (tx) => {
    await tx.staff.update({ where: { id }, data: { deletedAt: new Date(), status: staff.status === "ACTIVE" ? "RESIGNED" : staff.status } });
    await tx.section.updateMany({ where: { classTeacherId: id }, data: { classTeacherId: null } });
    if (staff.teacher) await tx.teacherSubject.deleteMany({ where: { teacherId: staff.teacher.id } });
    if (staff.userId) await tx.user.update({ where: { id: staff.userId }, data: { status: "DISABLED" } });
  });
  if (staff.userId) await destroyAllSessions(staff.userId);
  await auditFor(ctx)({ action: "staff.archive", entityType: "staff", entityId: id, before: staff });
}

export async function exportStaff(ctx: TenantContext, params: Omit<StaffListParams, "page" | "pageSize">) {
  const rows = await ctx.db.staff.findMany({
    where: staffWhere(ctx, params),
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 10_000,
    include: { campus: { select: { name: true } }, department: { select: { name: true } }, teacher: { select: { qualification: true, specialization: true } } },
  });
  return rows.map((s) => ({
    "Employee ID": s.employeeCode,
    "First Name": s.firstName,
    "Last Name": s.lastName,
    Type: s.teacher ? "Teacher" : "Staff",
    Designation: s.designation,
    Department: s.department?.name ?? "",
    Campus: s.campus.name,
    Phone: s.phone ?? "",
    Email: s.email ?? "",
    CNIC: s.cnic ?? "",
    "Joining Date": s.joiningDate?.toISOString().slice(0, 10) ?? "",
    Status: s.status,
    Qualification: s.teacher?.qualification ?? "",
    Specialization: s.teacher?.specialization ?? "",
  }));
}
