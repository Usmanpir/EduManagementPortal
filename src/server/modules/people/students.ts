import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { assertCampusAccess, campusScope, can, type TenantContext } from "@/server/auth/context";
import { bumpSequenceTo, formatCode, nextSequence } from "@/server/db/sequence";
import { badRequest, conflict, forbidden, notFound } from "@/server/http/errors";
import { accessibleSectionIds, sectionScope } from "@/server/modules/academics/scope";
import { attendanceRate, studentAttendanceCounts } from "@/server/modules/attendance/stats";
import { assertWithinLimit } from "@/server/modules/billing/limits";
import { dateOnly, toDateString } from "@/lib/format";
import type { bulkStudentActionSchema, guardianInputSchema, studentSchema } from "@/lib/validation/people";
import { nameMatch } from "@/server/db/search";

type StudentIn = z.output<typeof studentSchema>;
type GuardianIn = z.output<typeof guardianInputSchema>;

export const ADMISSION_SEQ = "student.admission";
const ADMISSION_PREFIX = "STU";

// ── Listing ──

export type StudentListParams = {
  q?: string;
  classId?: string[];
  sectionId?: string[];
  status?: string[];
  gender?: string[];
  campusId?: string[];
  sort?: string;
  dir?: "asc" | "desc";
  page: number;
  pageSize: number;
};

/** Numeric sort key for a roll number ("12" or "12A" → 12). */
export function rollOrderOf(roll: string | null | undefined): number | null {
  const m = roll ? /^\d{1,9}/.exec(roll) : null;
  return m ? Number(m[0]) : null;
}

const SORTS: Record<string, (dir: "asc" | "desc") => Prisma.StudentOrderByWithRelationInput[]> = {
  name: (dir) => [{ firstName: dir }, { lastName: dir }],
  admissionNo: (dir) => [{ admissionNo: dir }],
  // Register order: campus, class, section, then roll number numerically.
  class: (dir) => [
    { campus: { isMain: "desc" } },
    { campus: { name: "asc" } },
    { class: { level: dir } },
    { section: { name: dir } },
    { rollOrder: { sort: dir, nulls: "last" } },
    { rollNumber: dir },
  ],
  roll: (dir) => [{ rollOrder: { sort: dir, nulls: "last" } }, { rollNumber: dir }],
  admitted: (dir) => [{ admissionDate: dir }],
};

export async function studentWhere(ctx: TenantContext, params: Omit<StudentListParams, "page" | "pageSize" | "sort" | "dir">): Promise<Prisma.StudentWhereInput> {
  const scope = await sectionScope(ctx);
  const statuses = params.status?.length ? params.status : ["ACTIVE"];
  return {
    ...campusScope(ctx),
    ...(params.campusId?.length && !ctx.campusId ? { campusId: { in: params.campusId.filter((id) => !ctx.allowedCampusIds || ctx.allowedCampusIds.includes(id)) } } : {}),
    ...(scope.sectionId ? { sectionId: scope.sectionId } : {}),
    ...(params.classId?.length ? { classId: { in: params.classId } } : {}),
    ...(params.sectionId?.length ? { AND: [{ sectionId: { in: params.sectionId } }] } : {}),
    ...(params.gender?.length ? { gender: { in: params.gender as ("MALE" | "FEMALE" | "OTHER")[] } } : {}),
    status: { in: statuses as StudentIn["status"][] },
    ...(statuses.includes("ARCHIVED") ? {} : { archivedAt: null }),
    ...(params.q
      ? {
          OR: [
            nameMatch(params.q),
            { admissionNo: { contains: params.q, mode: "insensitive" } },
            { rollNumber: { equals: params.q } },
            { guardians: { some: { guardian: { phone: { contains: params.q } } } } },
            { bFormNumber: { contains: params.q } },
          ],
        }
      : {}),
  };
}

export async function listStudents(ctx: TenantContext, params: StudentListParams) {
  const where = await studentWhere(ctx, params);
  const orderBy = SORTS[params.sort ?? ""]?.(params.dir ?? "asc") ?? SORTS.class!("asc");
  const [rows, total] = await Promise.all([
    ctx.db.student.findMany({
      where,
      orderBy: [...orderBy, { firstName: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        admissionNo: true,
        firstName: true,
        lastName: true,
        gender: true,
        rollNumber: true,
        status: true,
        photoKey: true,
        campus: { select: { name: true } },
        class: { select: { id: true, name: true } },
        section: { select: { id: true, name: true } },
        guardians: {
          orderBy: { isPrimary: "desc" },
          take: 1,
          select: { guardian: { select: { firstName: true, lastName: true, phone: true } } },
        },
      },
    }),
    ctx.db.student.count({ where }),
  ]);
  const counts = await studentAttendanceCounts(ctx.db, rows.map((r) => r.id));
  return {
    total,
    rows: rows.map((s) => {
      const g = s.guardians[0]?.guardian;
      const c = counts.get(s.id);
      return {
        id: s.id,
        admissionNo: s.admissionNo,
        name: `${s.firstName} ${s.lastName}`,
        gender: s.gender,
        rollNumber: s.rollNumber,
        status: s.status,
        photoKey: s.photoKey,
        campusName: s.campus.name,
        classId: s.class?.id ?? null,
        className: s.class?.name ?? null,
        sectionId: s.section?.id ?? null,
        sectionName: s.section?.name ?? null,
        guardian: g ? { name: `${g.firstName} ${g.lastName}`, phone: g.phone } : null,
        attendanceRate: c ? attendanceRate(c) : null,
      };
    }),
  };
}

// ── Single student ──

/** Loads a student the current user may see (teachers: only their sections). */
export async function findAccessibleStudent(ctx: TenantContext, id: string) {
  const student = await ctx.db.student.findFirst({ where: { id } });
  if (!student) return null;
  assertCampusAccess(ctx, student.campusId);
  const allowed = await accessibleSectionIds(ctx);
  if (allowed && (!student.sectionId || !allowed.includes(student.sectionId))) return null;
  return student;
}

export async function getStudentProfile(ctx: TenantContext, id: string) {
  const base = await findAccessibleStudent(ctx, id);
  if (!base) return null;
  const student = await ctx.db.student.findFirstOrThrow({
    where: { id },
    include: {
      campus: { select: { id: true, name: true } },
      class: { select: { id: true, name: true } },
      section: { select: { id: true, name: true, classTeacher: { select: { firstName: true, lastName: true } } } },
      guardians: { orderBy: { isPrimary: "desc" }, include: { guardian: true } },
    },
  });
  const [counts, recentAttendance] = await Promise.all([
    studentAttendanceCounts(ctx.db, [id]),
    ctx.db.attendance.findMany({ where: { studentId: id }, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 30, select: { date: true, status: true, note: true, slot: true } }),
  ]);
  const c = counts.get(id) ?? { present: 0, absent: 0, late: 0, leave: 0 };
  return { student, attendance: { counts: c, rate: attendanceRate(c), recent: recentAttendance.map((a) => ({ ...a, date: toDateString(a.date) })) } };
}

// ── Helpers ──

async function resolvePlacement(ctx: TenantContext, campusId: string, sectionId: string | null) {
  assertCampusAccess(ctx, campusId);
  const campus = await ctx.db.campus.findFirst({ where: { id: campusId, deletedAt: null }, select: { id: true } });
  if (!campus) throw notFound("Campus");
  if (!sectionId) return { classId: null, sectionId: null };
  const section = await ctx.db.section.findFirst({ where: { id: sectionId, deletedAt: null }, select: { id: true, classId: true, campusId: true, capacity: true } });
  if (!section) throw notFound("Section");
  if (section.campusId !== campusId) throw badRequest("The section belongs to a different campus.", { sectionId: "Choose a section on this campus." });
  const allowed = await accessibleSectionIds(ctx);
  if (allowed && !allowed.includes(section.id)) throw forbidden("You can only add students to your own classes.");
  return { classId: section.classId, sectionId: section.id };
}

async function assertRollAvailable(ctx: TenantContext, sectionId: string | null, rollNumber: string | null, exceptId?: string) {
  if (!sectionId || !rollNumber) return;
  const taken = await ctx.db.student.findFirst({
    where: { sectionId, rollNumber, archivedAt: null, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { firstName: true, lastName: true },
  });
  if (taken) {
    const msg = `Roll number ${rollNumber} is already used by ${taken.firstName} ${taken.lastName}.`;
    throw conflict(msg, { rollNumber: msg });
  }
}

/** Uses the given admission number, or generates the next free one. */
export async function resolveAdmissionNo(ctx: TenantContext, requested: string | null, exceptId?: string) {
  if (requested) {
    const taken = await ctx.db.student.findFirst({ where: { admissionNo: requested, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, select: { id: true } });
    if (taken) throw conflict("This admission number is already in use.", { admissionNo: "This admission number is already in use." });
    const n = Number(/(\d+)$/.exec(requested)?.[1]);
    if (Number.isFinite(n) && requested.startsWith(`${ADMISSION_PREFIX}-`)) await bumpSequenceTo(ctx.orgId, ADMISSION_SEQ, n);
    return requested;
  }
  for (let i = 0; i < 20; i++) {
    const candidate = formatCode(ADMISSION_PREFIX, 1000 + (await nextSequence(ctx.orgId, ADMISSION_SEQ)));
    const taken = await ctx.db.student.findFirst({ where: { admissionNo: candidate }, select: { id: true } });
    if (!taken) return candidate;
  }
  throw conflict("Couldn't generate a unique admission number. Enter one manually.");
}

function studentData(input: StudentIn) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    gender: input.gender,
    dateOfBirth: input.dateOfBirth ? dateOnly(input.dateOfBirth) : null,
    bFormNumber: input.bFormNumber,
    cnic: input.cnic,
    bloodGroup: input.bloodGroup,
    religion: input.religion,
    nationality: input.nationality,
    phone: input.phone,
    email: input.email,
    address: input.address,
    city: input.city,
    rollNumber: input.rollNumber,
    rollOrder: rollOrderOf(input.rollNumber),
    admissionDate: input.admissionDate ? dateOnly(input.admissionDate) : null,
    emergencyContactName: input.emergencyContactName,
    emergencyContactPhone: input.emergencyContactPhone,
    medicalNotes: input.medicalNotes,
    notes: input.notes,
  };
}

/**
 * Links a guardian to a student: an explicit id (sibling's parent), an exact
 * match on phone + full name, or a new guardian record.
 */
export async function attachGuardian(ctx: TenantContext, studentId: string, g: GuardianIn, tx: TenantContext["db"] = ctx.db) {
  let guardianId = g.id;
  if (guardianId) {
    const existing = await tx.guardian.findFirst({ where: { id: guardianId, deletedAt: null }, select: { id: true } });
    if (!existing) throw notFound("Guardian");
  } else {
    // Only an exact phone + full-name match is reused silently; partial matches are
    // offered to the user as an explicit "link existing guardian" choice instead.
    const match = await tx.guardian.findFirst({
      where: {
        phone: g.phone,
        firstName: { equals: g.firstName, mode: "insensitive" },
        lastName: { equals: g.lastName, mode: "insensitive" },
        deletedAt: null,
      },
      select: { id: true },
    });
    guardianId =
      match?.id ??
      (
        await tx.guardian.create({
          data: {
            organizationId: ctx.orgId,
            firstName: g.firstName,
            lastName: g.lastName,
            relation: g.relation,
            phone: g.phone,
            whatsapp: g.whatsapp ?? g.phone,
            email: g.email,
            cnic: g.cnic,
            occupation: g.occupation,
          },
        })
      ).id;
  }
  if (g.isPrimary) await tx.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
  await tx.studentGuardian.upsert({
    where: { studentId_guardianId: { studentId, guardianId: guardianId! } },
    create: { organizationId: ctx.orgId, studentId, guardianId: guardianId!, relation: g.relation, isPrimary: g.isPrimary, receivesNotifications: g.receivesNotifications },
    update: { relation: g.relation, isPrimary: g.isPrimary, receivesNotifications: g.receivesNotifications },
  });
  return guardianId!;
}

// ── Mutations ──

export async function createStudent(ctx: TenantContext, input: StudentIn) {
  if (input.status === "ACTIVE") await assertWithinLimit(ctx.orgId, "students");
  const placement = await resolvePlacement(ctx, input.campusId, input.sectionId);
  await assertRollAvailable(ctx, placement.sectionId, input.rollNumber);
  const admissionNo = await resolveAdmissionNo(ctx, input.admissionNo);

  const student = await ctx.db.$transaction(async (tx) => {
    const created = await tx.student.create({
      data: {
        organizationId: ctx.orgId,
        campusId: input.campusId,
        ...placement,
        admissionNo,
        status: input.status,
        ...studentData(input),
        admissionDate: input.admissionDate ? dateOnly(input.admissionDate) : new Date(new Date().toISOString().slice(0, 10)),
      },
    });
    for (const [i, g] of (input.guardians ?? []).entries()) {
      // The first guardian listed is the primary contact.
      await attachGuardian(ctx, created.id, { ...g, isPrimary: i === 0 }, tx as unknown as TenantContext["db"]);
    }
    return created;
  });
  await auditFor(ctx)({ action: "student.create", entityType: "student", entityId: student.id, after: { ...input, admissionNo } });
  return student;
}

export async function updateStudent(ctx: TenantContext, id: string, input: StudentIn) {
  const before = await findAccessibleStudent(ctx, id);
  if (!before) throw notFound("Student");
  if (!can(ctx, "records.all") && input.campusId !== before.campusId) throw forbidden("You can't move students between campuses.");
  const placement = await resolvePlacement(ctx, input.campusId, input.sectionId);
  await assertRollAvailable(ctx, placement.sectionId, input.rollNumber, id);
  const admissionNo = input.admissionNo && input.admissionNo !== before.admissionNo ? await resolveAdmissionNo(ctx, input.admissionNo, id) : before.admissionNo;

  const reactivating = before.status !== "ACTIVE" && input.status === "ACTIVE";
  if (reactivating) await assertWithinLimit(ctx.orgId, "students");

  const after = await ctx.db.student.update({
    where: { id },
    data: {
      campusId: input.campusId,
      ...placement,
      admissionNo,
      status: input.status,
      archivedAt: input.status === "ARCHIVED" ? (before.archivedAt ?? new Date()) : null,
      ...studentData(input),
    },
  });
  await auditFor(ctx)({ action: "student.update", entityType: "student", entityId: id, before, after });
  return after;
}

export async function archiveStudent(ctx: TenantContext, id: string, reason: string | null) {
  const before = await findAccessibleStudent(ctx, id);
  if (!before) throw notFound("Student");
  if (before.archivedAt) return;
  await ctx.db.student.update({ where: { id }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  await auditFor(ctx)({ action: "student.archive", entityType: "student", entityId: id, before: { status: before.status }, metadata: { reason } });
}

export async function restoreStudent(ctx: TenantContext, id: string) {
  const before = await findAccessibleStudent(ctx, id);
  if (!before) throw notFound("Student");
  if (!before.archivedAt && before.status === "ACTIVE") return;
  await assertWithinLimit(ctx.orgId, "students");
  if (before.sectionId && before.rollNumber) {
    const clash = await ctx.db.student.findFirst({ where: { sectionId: before.sectionId, rollNumber: before.rollNumber, archivedAt: null, NOT: { id } }, select: { id: true } });
    if (clash) await ctx.db.student.update({ where: { id }, data: { rollNumber: null, rollOrder: null } });
  }
  await ctx.db.student.update({ where: { id }, data: { status: "ACTIVE", archivedAt: null } });
  await auditFor(ctx)({ action: "student.restore", entityType: "student", entityId: id });
}

export async function bulkStudentAction(ctx: TenantContext, input: z.output<typeof bulkStudentActionSchema>) {
  const where = await studentWhere(ctx, { status: ["ACTIVE", "INACTIVE", "GRADUATED", "TRANSFERRED", "ARCHIVED"] });
  const students = await ctx.db.student.findMany({ where: { ...where, id: { in: input.ids } }, select: { id: true, campusId: true } });
  if (students.length !== input.ids.length) throw notFound("Student");

  if (input.action === "archive") {
    await ctx.db.student.updateMany({ where: { id: { in: input.ids }, archivedAt: null }, data: { status: "ARCHIVED", archivedAt: new Date() } });
  } else if (input.action === "restore") {
    await assertWithinLimit(ctx.orgId, "students", input.ids.length);
    await ctx.db.student.updateMany({ where: { id: { in: input.ids } }, data: { status: "ACTIVE", archivedAt: null } });
  } else {
    if (!input.sectionId) throw badRequest("Choose a section to move students to.", { sectionId: "Choose a section." });
    const section = await ctx.db.section.findFirst({ where: { id: input.sectionId, deletedAt: null }, select: { id: true, classId: true, campusId: true } });
    if (!section) throw notFound("Section");
    if (students.some((s) => s.campusId !== section.campusId)) throw badRequest("All students must be on the same campus as the section.");
    // Roll numbers are section-specific, so they're cleared on a move.
    await ctx.db.student.updateMany({ where: { id: { in: input.ids } }, data: { sectionId: section.id, classId: section.classId, rollNumber: null, rollOrder: null } });
  }
  await auditFor(ctx)({ action: `student.bulk_${input.action}`, entityType: "student", metadata: { ids: input.ids, sectionId: input.sectionId } });
  return input.ids.length;
}

// ── Guardians on a student ──

export async function addGuardianToStudent(ctx: TenantContext, studentId: string, g: GuardianIn) {
  if (!(await findAccessibleStudent(ctx, studentId))) throw notFound("Student");
  const id = await attachGuardian(ctx, studentId, g);
  await auditFor(ctx)({ action: "student.guardian_add", entityType: "student", entityId: studentId, after: { guardianId: id, ...g } });
  return id;
}

export async function updateGuardian(ctx: TenantContext, studentId: string, guardianId: string, g: GuardianIn) {
  if (!(await findAccessibleStudent(ctx, studentId))) throw notFound("Student");
  const link = await ctx.db.studentGuardian.findFirst({ where: { studentId, guardianId } });
  if (!link) throw notFound("Guardian");
  await ctx.db.guardian.update({
    where: { id: guardianId },
    data: { firstName: g.firstName, lastName: g.lastName, relation: g.relation, phone: g.phone, whatsapp: g.whatsapp, email: g.email, cnic: g.cnic, occupation: g.occupation },
  });
  if (g.isPrimary) await ctx.db.studentGuardian.updateMany({ where: { studentId }, data: { isPrimary: false } });
  await ctx.db.studentGuardian.update({
    where: { studentId_guardianId: { studentId, guardianId } },
    data: { relation: g.relation, isPrimary: g.isPrimary, receivesNotifications: g.receivesNotifications },
  });
  await auditFor(ctx)({ action: "student.guardian_update", entityType: "guardian", entityId: guardianId, after: g });
}

export async function removeGuardianFromStudent(ctx: TenantContext, studentId: string, guardianId: string) {
  if (!(await findAccessibleStudent(ctx, studentId))) throw notFound("Student");
  const result = await ctx.db.studentGuardian.deleteMany({ where: { studentId, guardianId } });
  if (result.count === 0) throw notFound("Guardian");
  await auditFor(ctx)({ action: "student.guardian_remove", entityType: "student", entityId: studentId, metadata: { guardianId } });
}

/** Guardians matching a phone number — used to link siblings to an existing parent. */
export async function findGuardiansByPhone(ctx: TenantContext, phone: string) {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 7) return [];
  const rows = await ctx.db.guardian.findMany({
    where: { deletedAt: null, phone: { contains: digits.slice(-7) } },
    take: 5,
    include: { students: { include: { student: { select: { firstName: true, lastName: true } } } } },
  });
  return rows.map((g) => ({
    id: g.id,
    name: `${g.firstName} ${g.lastName}`,
    firstName: g.firstName,
    lastName: g.lastName,
    relation: g.relation,
    phone: g.phone,
    email: g.email,
    children: g.students.map((s) => `${s.student.firstName} ${s.student.lastName}`),
  }));
}

export type StudentExportRow = Record<string, string>;

export async function exportStudents(ctx: TenantContext, params: Omit<StudentListParams, "page" | "pageSize">, ids?: string[]): Promise<StudentExportRow[]> {
  const where = await studentWhere(ctx, params);
  const rows = await ctx.db.student.findMany({
    where: { ...where, ...(ids?.length ? { id: { in: ids } } : {}) },
    orderBy: [...SORTS.class!("asc"), { firstName: "asc" }],
    take: 20_000,
    include: {
      campus: { select: { name: true } },
      class: { select: { name: true } },
      section: { select: { name: true } },
      guardians: { orderBy: { isPrimary: "desc" }, take: 1, include: { guardian: true } },
    },
  });
  return rows.map((s) => {
    const g = s.guardians[0]?.guardian;
    return {
      "Admission No": s.admissionNo,
      "First Name": s.firstName,
      "Last Name": s.lastName,
      Gender: s.gender ?? "",
      "Date of Birth": s.dateOfBirth ? toDateString(s.dateOfBirth) : "",
      Campus: s.campus.name,
      Class: s.class?.name ?? "",
      Section: s.section?.name ?? "",
      "Roll No": s.rollNumber ?? "",
      Status: s.status,
      "B-Form": s.bFormNumber ?? "",
      Phone: s.phone ?? "",
      Email: s.email ?? "",
      Address: s.address ?? "",
      "Guardian Name": g ? `${g.firstName} ${g.lastName}` : "",
      "Guardian Relation": g?.relation ?? "",
      "Guardian Phone": g?.phone ?? "",
      "Guardian Email": g?.email ?? "",
      "Admission Date": s.admissionDate ? toDateString(s.admissionDate) : "",
    };
  });
}
