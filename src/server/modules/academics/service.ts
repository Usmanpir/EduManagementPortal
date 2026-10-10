import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { assertCampusAccess, campusScope, type TenantContext } from "@/server/auth/context";
import { badRequest, conflict, notFound } from "@/server/http/errors";
import { dateOnly, toDateString } from "@/lib/format";
import type {
  academicYearSchema,
  classSchema,
  classSubjectsSchema,
  departmentSchema,
  roomSchema,
  sectionSchema,
  subjectSchema,
  teachingAssignmentSchema,
  SUBJECT_TYPES,
} from "@/lib/validation/academics";

type SubjectType = (typeof SUBJECT_TYPES)[number];
import { accessibleSectionIds } from "./scope";

type In<T extends z.ZodType> = z.output<T>;

// ── Reference checks (all through the tenant client, so foreign ids are "not found") ──

async function ensureCampus(ctx: TenantContext, campusId: string) {
  assertCampusAccess(ctx, campusId);
  const campus = await ctx.db.campus.findFirst({ where: { id: campusId, deletedAt: null }, select: { id: true } });
  if (!campus) throw notFound("Campus");
}

async function ensureDepartment(ctx: TenantContext, id: string | null) {
  if (!id) return;
  if (!(await ctx.db.department.findFirst({ where: { id, deletedAt: null }, select: { id: true } }))) throw notFound("Department");
}

async function ensureClass(ctx: TenantContext, classId: string) {
  const cls = await ctx.db.class.findFirst({ where: { id: classId, deletedAt: null }, select: { id: true, campusId: true, name: true } });
  if (!cls) throw notFound("Class");
  assertCampusAccess(ctx, cls.campusId);
  return cls;
}

async function ensureStaff(ctx: TenantContext, staffId: string | null, campusId?: string) {
  if (!staffId) return;
  const staff = await ctx.db.staff.findFirst({ where: { id: staffId, deletedAt: null }, select: { campusId: true } });
  if (!staff) throw notFound("Staff member");
  if (campusId && staff.campusId !== campusId) throw badRequest("The class teacher must belong to the same campus.");
}

async function ensureRoom(ctx: TenantContext, roomId: string | null, campusId?: string) {
  if (!roomId) return;
  const room = await ctx.db.room.findFirst({ where: { id: roomId, deletedAt: null }, select: { campusId: true } });
  if (!room) throw notFound("Room");
  if (campusId && room.campusId !== campusId) throw badRequest("The room must be on the same campus.");
}

async function ensureYear(ctx: TenantContext, id: string | null) {
  if (!id) return;
  if (!(await ctx.db.academicYear.findFirst({ where: { id }, select: { id: true } }))) throw notFound("Academic year");
}

// ── Academic years ──

export async function listAcademicYears(ctx: TenantContext) {
  const years = await ctx.db.academicYear.findMany({ orderBy: { startDate: "desc" }, include: { _count: { select: { sections: true, exams: true } } } });
  return years.map((y) => ({
    id: y.id,
    name: y.name,
    startDate: toDateString(y.startDate),
    endDate: toDateString(y.endDate),
    isCurrent: y.isCurrent,
    inUse: y._count.sections + y._count.exams > 0,
  }));
}

export async function currentAcademicYear(ctx: TenantContext) {
  return ctx.db.academicYear.findFirst({ where: { isCurrent: true } });
}

export async function saveAcademicYear(ctx: TenantContext, id: string | null, input: In<typeof academicYearSchema>) {
  const data = { name: input.name, startDate: dateOnly(input.startDate), endDate: dateOnly(input.endDate) };
  const dup = await ctx.db.academicYear.findFirst({ where: { name: input.name, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (dup) throw conflict("An academic year with this name already exists.", { name: "An academic year with this name already exists." });

  const year = await ctx.db.$transaction(async (tx) => {
    if (input.isCurrent) await tx.academicYear.updateMany({ where: { isCurrent: true }, data: { isCurrent: false } });
    if (id) {
      const existing = await tx.academicYear.findFirst({ where: { id } });
      if (!existing) throw notFound("Academic year");
      return tx.academicYear.update({ where: { id }, data: { ...data, ...(input.isCurrent ? { isCurrent: true } : {}) } });
    }
    const count = await tx.academicYear.count();
    // The first year an organization creates is current automatically.
    return tx.academicYear.create({ data: { organizationId: ctx.orgId, ...data, isCurrent: input.isCurrent || count === 0 } });
  });
  await auditFor(ctx)({ action: id ? "academic_year.update" : "academic_year.create", entityType: "academic_year", entityId: year.id, after: input });
  return year;
}

export async function deleteAcademicYear(ctx: TenantContext, id: string) {
  const year = await ctx.db.academicYear.findFirst({ where: { id }, include: { _count: { select: { sections: true, exams: true, feeStructures: true } } } });
  if (!year) throw notFound("Academic year");
  if (year._count.sections + year._count.exams + year._count.feeStructures > 0) {
    throw badRequest("This academic year is used by sections, exams or fees and can't be deleted.");
  }
  await ctx.db.academicYear.delete({ where: { id } });
  await auditFor(ctx)({ action: "academic_year.delete", entityType: "academic_year", entityId: id, before: year });
}

// ── Departments ──

export async function listDepartments(ctx: TenantContext) {
  const rows = await ctx.db.department.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { subjects: { where: { deletedAt: null } }, staff: { where: { deletedAt: null } }, classes: { where: { deletedAt: null } } } } },
  });
  return rows.map((d) => ({ id: d.id, name: d.name, code: d.code, description: d.description, subjects: d._count.subjects, staff: d._count.staff, classes: d._count.classes }));
}

export async function saveDepartment(ctx: TenantContext, id: string | null, input: In<typeof departmentSchema>) {
  const dup = await ctx.db.department.findFirst({ where: { code: input.code, deletedAt: null, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (dup) throw conflict("Another department uses this code.", { code: "Another department uses this code." });
  if (id) {
    if (!(await ctx.db.department.findFirst({ where: { id, deletedAt: null } }))) throw notFound("Department");
    const d = await ctx.db.department.update({ where: { id }, data: input });
    await auditFor(ctx)({ action: "department.update", entityType: "department", entityId: id, after: input });
    return d;
  }
  // A previously archived department with the same code is revived rather than duplicated.
  const archived = await ctx.db.department.findFirst({ where: { code: input.code, deletedAt: { not: null } } });
  const d = archived
    ? await ctx.db.department.update({ where: { id: archived.id }, data: { ...input, deletedAt: null } })
    : await ctx.db.department.create({ data: { organizationId: ctx.orgId, ...input } });
  await auditFor(ctx)({ action: "department.create", entityType: "department", entityId: d.id, after: input });
  return d;
}

export async function archiveDepartment(ctx: TenantContext, id: string) {
  const d = await ctx.db.department.findFirst({ where: { id, deletedAt: null } });
  if (!d) throw notFound("Department");
  await ctx.db.department.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditFor(ctx)({ action: "department.archive", entityType: "department", entityId: id, before: d });
}

// ── Classes ──

export async function listClasses(ctx: TenantContext, opts: { q?: string } = {}) {
  const sections = await accessibleSectionIds(ctx);
  const classes = await ctx.db.class.findMany({
    where: {
      deletedAt: null,
      ...campusScope(ctx),
      ...(opts.q ? { name: { contains: opts.q, mode: "insensitive" } } : {}),
      ...(sections ? { sections: { some: { id: { in: sections } } } } : {}),
    },
    orderBy: [{ level: "asc" }, { name: "asc" }],
    include: {
      campus: { select: { name: true } },
      department: { select: { name: true } },
      sections: {
        where: { deletedAt: null, ...(sections ? { id: { in: sections } } : {}) },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          capacity: true,
          classTeacher: { select: { firstName: true, lastName: true } },
          _count: { select: { students: { where: { archivedAt: null, status: "ACTIVE" } } } },
        },
      },
      _count: { select: { subjects: true } },
    },
  });
  return classes.map((c) => ({
    id: c.id,
    name: c.name,
    level: c.level,
    campusId: c.campusId,
    campusName: c.campus.name,
    departmentId: c.departmentId,
    departmentName: c.department?.name ?? null,
    description: c.description,
    subjects: c._count.subjects,
    students: c.sections.reduce((n, s) => n + s._count.students, 0),
    sections: c.sections.map((s) => ({
      id: s.id,
      name: s.name,
      capacity: s.capacity,
      students: s._count.students,
      classTeacher: s.classTeacher ? `${s.classTeacher.firstName} ${s.classTeacher.lastName}` : null,
    })),
  }));
}

export async function getClass(ctx: TenantContext, id: string) {
  const cls = await ctx.db.class.findFirst({
    where: { id, deletedAt: null },
    include: {
      campus: { select: { id: true, name: true } },
      department: { select: { id: true, name: true } },
      sections: {
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        include: {
          classTeacher: { select: { id: true, firstName: true, lastName: true } },
          room: { select: { id: true, name: true } },
          academicYear: { select: { id: true, name: true } },
          teachingAssignments: { select: { subjectId: true, teacherId: true } },
          _count: { select: { students: { where: { archivedAt: null, status: "ACTIVE" } } } },
        },
      },
      subjects: {
        orderBy: { subject: { name: "asc" } },
        include: { subject: { select: { id: true, name: true, code: true, type: true, color: true } } },
      },
    },
  });
  if (!cls) return null;
  assertCampusAccess(ctx, cls.campusId);
  const allowed = await accessibleSectionIds(ctx);
  if (allowed && !cls.sections.some((s) => allowed.includes(s.id))) return null;
  return cls;
}

export async function createClass(ctx: TenantContext, input: In<typeof classSchema>) {
  await ensureCampus(ctx, input.campusId);
  await ensureDepartment(ctx, input.departmentId);
  const dup = await ctx.db.class.findFirst({ where: { campusId: input.campusId, name: input.name, deletedAt: null }, select: { id: true } });
  if (dup) throw conflict("This campus already has a class with that name.", { name: "This campus already has a class with that name." });

  const year = await currentAcademicYear(ctx);
  const sectionNames = [...new Set((input.sections ?? []).map((s) => s.toUpperCase()))];
  const cls = await ctx.db.$transaction(async (tx) => {
    const created = await tx.class.create({
      data: { organizationId: ctx.orgId, campusId: input.campusId, name: input.name, level: input.level, departmentId: input.departmentId, description: input.description },
    });
    if (sectionNames.length) {
      await tx.section.createMany({
        data: sectionNames.map((name) => ({ organizationId: ctx.orgId, campusId: input.campusId, classId: created.id, name, academicYearId: year?.id ?? null })),
      });
    }
    return created;
  });
  await auditFor(ctx)({ action: "class.create", entityType: "class", entityId: cls.id, after: input });
  return cls;
}

export async function updateClass(ctx: TenantContext, id: string, input: In<typeof classSchema>) {
  const before = await ensureClass(ctx, id);
  if (before.campusId !== input.campusId) throw badRequest("A class can't be moved to another campus. Create it on the new campus instead.");
  await ensureDepartment(ctx, input.departmentId);
  const dup = await ctx.db.class.findFirst({ where: { campusId: input.campusId, name: input.name, deletedAt: null, NOT: { id } }, select: { id: true } });
  if (dup) throw conflict("This campus already has a class with that name.", { name: "This campus already has a class with that name." });
  const cls = await ctx.db.class.update({
    where: { id },
    data: { name: input.name, level: input.level, departmentId: input.departmentId, description: input.description },
  });
  await auditFor(ctx)({ action: "class.update", entityType: "class", entityId: id, before, after: input });
  return cls;
}

export async function archiveClass(ctx: TenantContext, id: string) {
  const cls = await ensureClass(ctx, id);
  const students = await ctx.db.student.count({ where: { classId: id, archivedAt: null, status: "ACTIVE" } });
  if (students > 0) throw badRequest(`This class still has ${students} active students. Promote or move them first.`);
  const now = new Date();
  await ctx.db.$transaction([
    ctx.db.section.updateMany({ where: { classId: id, deletedAt: null }, data: { deletedAt: now } }),
    ctx.db.class.update({ where: { id }, data: { deletedAt: now } }),
  ]);
  await auditFor(ctx)({ action: "class.archive", entityType: "class", entityId: id, before: cls });
}

export async function setClassSubjects(ctx: TenantContext, classId: string, input: In<typeof classSubjectsSchema>) {
  await ensureClass(ctx, classId);
  const ids = [...new Set(input.subjects.map((s) => s.subjectId))];
  const found = await ctx.db.subject.count({ where: { id: { in: ids }, deletedAt: null } });
  if (found !== ids.length) throw notFound("Subject");

  const before = await ctx.db.classSubject.findMany({ where: { classId }, select: { subjectId: true } });
  await ctx.db.$transaction([
    ctx.db.classSubject.deleteMany({ where: { classId, subjectId: { notIn: ids } } }),
    ...input.subjects.map((s) =>
      ctx.db.classSubject.upsert({
        where: { classId_subjectId: { classId, subjectId: s.subjectId } },
        create: { organizationId: ctx.orgId, classId, subjectId: s.subjectId, periodsPerWeek: s.periodsPerWeek },
        update: { periodsPerWeek: s.periodsPerWeek },
      }),
    ),
  ]);
  await auditFor(ctx)({ action: "class.subjects_update", entityType: "class", entityId: classId, before: before.map((b) => b.subjectId), after: ids });
}

// ── Sections ──

export type SectionListParams = { q?: string; classId?: string[]; page: number; pageSize: number };

export async function listSections(ctx: TenantContext, params: SectionListParams) {
  const allowed = await accessibleSectionIds(ctx);
  const where: Prisma.SectionWhereInput = {
    deletedAt: null,
    class: { deletedAt: null },
    ...campusScope(ctx),
    ...(allowed ? { id: { in: allowed } } : {}),
    ...(params.classId?.length ? { classId: { in: params.classId } } : {}),
    ...(params.q
      ? {
          OR: [
            { name: { contains: params.q, mode: "insensitive" } },
            { class: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.db.section.findMany({
      where,
      orderBy: [{ class: { level: "asc" } }, { class: { name: "asc" } }, { name: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      include: {
        class: { select: { id: true, name: true } },
        campus: { select: { name: true } },
        classTeacher: { select: { id: true, firstName: true, lastName: true } },
        room: { select: { id: true, name: true } },
        academicYear: { select: { id: true, name: true } },
        _count: { select: { students: { where: { archivedAt: null, status: "ACTIVE" } } } },
      },
    }),
    ctx.db.section.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((s) => ({
      id: s.id,
      name: s.name,
      classId: s.class.id,
      className: s.class.name,
      campusName: s.campus.name,
      capacity: s.capacity,
      students: s._count.students,
      classTeacherId: s.classTeacher?.id ?? null,
      classTeacher: s.classTeacher ? `${s.classTeacher.firstName} ${s.classTeacher.lastName}` : null,
      roomId: s.room?.id ?? null,
      roomName: s.room?.name ?? null,
      academicYearId: s.academicYear?.id ?? null,
      academicYear: s.academicYear?.name ?? null,
    })),
  };
}

export async function createSection(ctx: TenantContext, input: In<typeof sectionSchema>) {
  const cls = await ensureClass(ctx, input.classId);
  await Promise.all([ensureStaff(ctx, input.classTeacherId, cls.campusId), ensureRoom(ctx, input.roomId, cls.campusId), ensureYear(ctx, input.academicYearId)]);
  const name = input.name.toUpperCase();
  const dup = await ctx.db.section.findFirst({ where: { classId: input.classId, name, deletedAt: null }, select: { id: true } });
  if (dup) throw conflict(`${cls.name} already has section ${name}.`, { name: `${cls.name} already has section ${name}.` });
  const archived = await ctx.db.section.findFirst({ where: { classId: input.classId, name, deletedAt: { not: null } } });
  const data = { capacity: input.capacity, classTeacherId: input.classTeacherId, roomId: input.roomId, academicYearId: input.academicYearId ?? (await currentAcademicYear(ctx))?.id ?? null };
  const section = archived
    ? await ctx.db.section.update({ where: { id: archived.id }, data: { ...data, deletedAt: null } })
    : await ctx.db.section.create({ data: { organizationId: ctx.orgId, campusId: cls.campusId, classId: input.classId, name, ...data } });
  await auditFor(ctx)({ action: "section.create", entityType: "section", entityId: section.id, after: input });
  return section;
}

export async function updateSection(ctx: TenantContext, id: string, input: In<typeof sectionSchema>) {
  const before = await ctx.db.section.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("Section");
  assertCampusAccess(ctx, before.campusId);
  if (before.classId !== input.classId) throw badRequest("A section can't be moved to another class.");
  await Promise.all([ensureStaff(ctx, input.classTeacherId, before.campusId), ensureRoom(ctx, input.roomId, before.campusId), ensureYear(ctx, input.academicYearId)]);
  const name = input.name.toUpperCase();
  const dup = await ctx.db.section.findFirst({ where: { classId: input.classId, name, deletedAt: null, NOT: { id } }, select: { id: true } });
  if (dup) throw conflict(`This class already has section ${name}.`, { name: `This class already has section ${name}.` });
  const section = await ctx.db.section.update({
    where: { id },
    data: { name, capacity: input.capacity, classTeacherId: input.classTeacherId, roomId: input.roomId, academicYearId: input.academicYearId },
  });
  await auditFor(ctx)({ action: "section.update", entityType: "section", entityId: id, before, after: input });
  return section;
}

export async function archiveSection(ctx: TenantContext, id: string) {
  const section = await ctx.db.section.findFirst({ where: { id, deletedAt: null } });
  if (!section) throw notFound("Section");
  assertCampusAccess(ctx, section.campusId);
  const students = await ctx.db.student.count({ where: { sectionId: id, archivedAt: null, status: "ACTIVE" } });
  if (students > 0) throw badRequest(`This section still has ${students} active students. Move them first.`);
  await ctx.db.section.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditFor(ctx)({ action: "section.archive", entityType: "section", entityId: id, before: section });
}

/** Assigns (or clears) the teacher who teaches a subject to a section. */
export async function setTeachingAssignment(ctx: TenantContext, input: In<typeof teachingAssignmentSchema>) {
  const section = await ctx.db.section.findFirst({ where: { id: input.sectionId, deletedAt: null }, select: { id: true, classId: true, campusId: true } });
  if (!section) throw notFound("Section");
  assertCampusAccess(ctx, section.campusId);
  const offered = await ctx.db.classSubject.findFirst({ where: { classId: section.classId, subjectId: input.subjectId }, select: { id: true } });
  if (!offered) throw badRequest("Add this subject to the class before assigning a teacher.");

  if (!input.teacherId) {
    await ctx.db.teacherSubject.deleteMany({ where: { sectionId: input.sectionId, subjectId: input.subjectId } });
  } else {
    const teacher = await ctx.db.teacher.findFirst({ where: { id: input.teacherId, staff: { deletedAt: null } }, select: { id: true } });
    if (!teacher) throw notFound("Teacher");
    await ctx.db.teacherSubject.upsert({
      where: { sectionId_subjectId: { sectionId: input.sectionId, subjectId: input.subjectId } },
      create: { organizationId: ctx.orgId, sectionId: input.sectionId, subjectId: input.subjectId, teacherId: input.teacherId },
      update: { teacherId: input.teacherId },
    });
  }
  await auditFor(ctx)({ action: "section.teacher_assign", entityType: "section", entityId: input.sectionId, after: input });
}

// ── Subjects ──

export async function listSubjects(ctx: TenantContext, opts: { q?: string; type?: string[] } = {}) {
  const rows = await ctx.db.subject.findMany({
    where: {
      deletedAt: null,
      ...(opts.q ? { OR: [{ name: { contains: opts.q, mode: "insensitive" } }, { code: { contains: opts.q, mode: "insensitive" } }] } : {}),
      ...(opts.type?.length ? { type: { in: opts.type as SubjectType[] } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      department: { select: { id: true, name: true } },
      classes: { where: { class: { deletedAt: null } }, select: { class: { select: { name: true } } } },
      _count: { select: { teachingAssignments: true } },
    },
  });
  return rows.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    type: s.type,
    color: s.color,
    departmentId: s.department?.id ?? null,
    departmentName: s.department?.name ?? null,
    classes: s.classes.map((c) => c.class.name),
    teachers: s._count.teachingAssignments,
  }));
}

export async function saveSubject(ctx: TenantContext, id: string | null, input: In<typeof subjectSchema>) {
  await ensureDepartment(ctx, input.departmentId);
  const dup = await ctx.db.subject.findFirst({ where: { code: input.code, deletedAt: null, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (dup) throw conflict("Another subject uses this code.", { code: "Another subject uses this code." });
  if (id) {
    if (!(await ctx.db.subject.findFirst({ where: { id, deletedAt: null } }))) throw notFound("Subject");
    const s = await ctx.db.subject.update({ where: { id }, data: input });
    await auditFor(ctx)({ action: "subject.update", entityType: "subject", entityId: id, after: input });
    return s;
  }
  const archived = await ctx.db.subject.findFirst({ where: { code: input.code, deletedAt: { not: null } } });
  const s = archived
    ? await ctx.db.subject.update({ where: { id: archived.id }, data: { ...input, deletedAt: null } })
    : await ctx.db.subject.create({ data: { organizationId: ctx.orgId, ...input } });
  await auditFor(ctx)({ action: "subject.create", entityType: "subject", entityId: s.id, after: input });
  return s;
}

export async function archiveSubject(ctx: TenantContext, id: string) {
  const s = await ctx.db.subject.findFirst({ where: { id, deletedAt: null } });
  if (!s) throw notFound("Subject");
  await ctx.db.subject.update({ where: { id }, data: { deletedAt: new Date() } });
  await auditFor(ctx)({ action: "subject.archive", entityType: "subject", entityId: id, before: s });
}

// ── Rooms ──

export async function listRooms(ctx: TenantContext) {
  const rows = await ctx.db.room.findMany({
    where: { deletedAt: null, ...campusScope(ctx) },
    orderBy: [{ campus: { name: "asc" } }, { name: "asc" }],
    include: { campus: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, code: r.code, capacity: r.capacity, type: r.type, campusId: r.campusId, campusName: r.campus.name }));
}

export async function saveRoom(ctx: TenantContext, id: string | null, input: In<typeof roomSchema>) {
  await ensureCampus(ctx, input.campusId);
  const dup = await ctx.db.room.findFirst({ where: { campusId: input.campusId, name: input.name, deletedAt: null, ...(id ? { NOT: { id } } : {}) }, select: { id: true } });
  if (dup) throw conflict("This campus already has a room with that name.", { name: "This campus already has a room with that name." });
  if (id) {
    const before = await ctx.db.room.findFirst({ where: { id, deletedAt: null } });
    if (!before) throw notFound("Room");
    if (before.campusId !== input.campusId) throw badRequest("Rooms can't move between campuses.");
    const r = await ctx.db.room.update({ where: { id }, data: input });
    await auditFor(ctx)({ action: "room.update", entityType: "room", entityId: id, after: input });
    return r;
  }
  const r = await ctx.db.room.create({ data: { organizationId: ctx.orgId, ...input } });
  await auditFor(ctx)({ action: "room.create", entityType: "room", entityId: r.id, after: input });
  return r;
}

export async function archiveRoom(ctx: TenantContext, id: string) {
  const r = await ctx.db.room.findFirst({ where: { id, deletedAt: null } });
  if (!r) throw notFound("Room");
  assertCampusAccess(ctx, r.campusId);
  await ctx.db.room.update({ where: { id }, data: { deletedAt: new Date() } });
  await ctx.db.section.updateMany({ where: { roomId: id }, data: { roomId: null } });
  await auditFor(ctx)({ action: "room.archive", entityType: "room", entityId: id, before: r });
}

// ── Lookups for forms ──

export async function academicLookups(ctx: TenantContext) {
  const [campuses, departments, years, staff, rooms] = await Promise.all([
    ctx.db.campus.findMany({ where: { deletedAt: null, ...(ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {}) }, select: { id: true, name: true }, orderBy: [{ isMain: "desc" }, { name: "asc" }] }),
    ctx.db.department.findMany({ where: { deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ctx.db.academicYear.findMany({ select: { id: true, name: true, isCurrent: true }, orderBy: { startDate: "desc" } }),
    ctx.db.staff.findMany({
      where: { deletedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...campusScope(ctx) },
      select: { id: true, firstName: true, lastName: true, campusId: true, designation: true, teacher: { select: { id: true } } },
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    }),
    ctx.db.room.findMany({ where: { deletedAt: null, ...campusScope(ctx) }, select: { id: true, name: true, campusId: true }, orderBy: { name: "asc" } }),
  ]);
  return {
    campuses,
    departments,
    years,
    staff: staff.map((s) => ({ id: s.id, name: `${s.firstName} ${s.lastName}`, campusId: s.campusId, designation: s.designation, teacherId: s.teacher?.id ?? null })),
    rooms,
  };
}
