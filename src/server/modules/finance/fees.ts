import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { assertCampusAccess, campusScope, type TenantContext } from "@/server/auth/context";
import { badRequest, notFound } from "@/server/http/errors";
import { findAccessibleStudent } from "@/server/modules/people/students";
import { currentAcademicYear } from "@/server/modules/academics/service";
import { OPT_IN_CATEGORIES, type feeStructureSchema, type studentFeeSchema } from "@/lib/validation/finance";

export const isOptIn = (category: string) => (OPT_IN_CATEGORIES as readonly string[]).includes(category);

/** Fee structures that could apply to a student (by class & campus). */
export function applicableWhere(student: { classId: string | null; campusId: string }): Prisma.FeeStructureWhereInput {
  return {
    isActive: true,
    AND: [{ OR: [{ classId: null }, ...(student.classId ? [{ classId: student.classId }] : [])] }, { OR: [{ campusId: null }, { campusId: student.campusId }] }],
  };
}

/** Class & campus options for finance filters and forms. */
export async function financeLookups(ctx: TenantContext) {
  const campusWhere = ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {};
  const [campuses, classes] = await Promise.all([
    ctx.db.campus.findMany({ where: { deletedAt: null, ...campusWhere }, select: { id: true, name: true, code: true }, orderBy: [{ isMain: "desc" }, { name: "asc" }] }),
    ctx.db.class.findMany({ where: { deletedAt: null, ...campusScope(ctx) }, select: { id: true, name: true, campusId: true }, orderBy: [{ level: "asc" }, { name: "asc" }] }),
  ]);
  const multi = campuses.length > 1;
  const code = new Map(campuses.map((c) => [c.id, c.code]));
  return {
    campuses: campuses.map((c) => ({ value: c.id, label: c.name })),
    classes: classes.map((c) => ({ value: c.id, label: multi ? `${c.name} · ${code.get(c.campusId)}` : c.name, campusId: c.campusId })),
  };
}

export async function listFeeStructures(ctx: TenantContext) {
  const rows = await ctx.db.feeStructure.findMany({
    where: ctx.allowedCampusIds ? { OR: [{ campusId: null }, { campusId: { in: ctx.allowedCampusIds } }] } : {},
    orderBy: [{ isActive: "desc" }, { category: "asc" }, { name: "asc" }],
    include: { class: { select: { id: true, name: true } }, _count: { select: { studentFees: { where: { isActive: true } }, invoiceItems: true } } },
  });
  const campuses = await ctx.db.campus.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
  const campusName = new Map(campuses.map((c) => [c.id, c.name]));
  return rows.map((f) => ({
    id: f.id,
    name: f.name,
    category: f.category,
    amount: Number(f.amount),
    frequency: f.frequency,
    dueDay: f.dueDay,
    classId: f.classId,
    className: f.class?.name ?? null,
    campusId: f.campusId,
    campusName: f.campusId ? (campusName.get(f.campusId) ?? null) : null,
    isActive: f.isActive,
    optIn: isOptIn(f.category),
    enrolled: f._count.studentFees,
    used: f._count.invoiceItems > 0,
  }));
}

export async function saveFeeStructure(ctx: TenantContext, id: string | null, input: z.output<typeof feeStructureSchema>) {
  if (input.campusId) assertCampusAccess(ctx, input.campusId);
  if (input.classId) {
    const cls = await ctx.db.class.findFirst({ where: { id: input.classId, deletedAt: null }, select: { campusId: true } });
    if (!cls) throw notFound("Class");
    if (input.campusId && cls.campusId !== input.campusId) throw badRequest("That class is on a different campus.", { classId: "Class is on a different campus." });
  }
  if (input.campusId && !(await ctx.db.campus.findFirst({ where: { id: input.campusId, deletedAt: null }, select: { id: true } }))) throw notFound("Campus");
  if (id) {
    const before = await ctx.db.feeStructure.findFirst({ where: { id } });
    if (!before) throw notFound("Fee");
    const after = await ctx.db.feeStructure.update({ where: { id }, data: input });
    await auditFor(ctx)({ action: "fee.update", entityType: "fee_structure", entityId: id, before, after });
    return after;
  }
  const year = await currentAcademicYear(ctx);
  const fee = await ctx.db.feeStructure.create({ data: { organizationId: ctx.orgId, academicYearId: year?.id ?? null, ...input } });
  await auditFor(ctx)({ action: "fee.create", entityType: "fee_structure", entityId: fee.id, after: input });
  return fee;
}

export async function deleteFeeStructure(ctx: TenantContext, id: string) {
  const fee = await ctx.db.feeStructure.findFirst({ where: { id }, include: { _count: { select: { invoiceItems: true } } } });
  if (!fee) throw notFound("Fee");
  if (fee._count.invoiceItems > 0) {
    // Billed fees are kept for history; they're switched off instead.
    await ctx.db.feeStructure.update({ where: { id }, data: { isActive: false } });
  } else {
    await ctx.db.feeStructure.delete({ where: { id } });
  }
  await auditFor(ctx)({ action: "fee.delete", entityType: "fee_structure", entityId: id, before: fee });
  return fee._count.invoiceItems > 0 ? "deactivated" : "deleted";
}

/** Each applicable fee for a student, with whether it applies and any discount. */
export async function studentFeePlan(ctx: TenantContext, studentId: string) {
  const student = await findAccessibleStudent(ctx, studentId);
  if (!student) throw notFound("Student");
  const [structures, assignments] = await Promise.all([
    ctx.db.feeStructure.findMany({ where: applicableWhere(student), orderBy: [{ category: "asc" }, { name: "asc" }] }),
    ctx.db.studentFee.findMany({ where: { studentId } }),
  ]);
  const byFee = new Map(assignments.map((a) => [a.feeStructureId, a]));
  return structures.map((f) => {
    const a = byFee.get(f.id);
    const optIn = isOptIn(f.category);
    return {
      feeStructureId: f.id,
      name: f.name,
      category: f.category,
      frequency: f.frequency,
      amount: Number(f.amount),
      optIn,
      applies: a ? a.isActive : !optIn,
      discountType: a?.discountType ?? "NONE",
      discountValue: Number(a?.discountValue ?? 0),
      discountReason: a?.discountReason ?? null,
    };
  });
}

export async function setStudentFee(ctx: TenantContext, studentId: string, input: z.output<typeof studentFeeSchema>) {
  const student = await findAccessibleStudent(ctx, studentId);
  if (!student) throw notFound("Student");
  const fee = await ctx.db.feeStructure.findFirst({ where: { id: input.feeStructureId, ...applicableWhere(student) } });
  if (!fee) throw notFound("Fee");
  if (input.discountType === "PERCENT" && input.discountValue > 100) throw badRequest("A percentage discount can't exceed 100%.", { discountValue: "Max 100%." });
  if (input.discountType === "FIXED" && input.discountValue > Number(fee.amount)) throw badRequest("The discount is larger than the fee.", { discountValue: "Larger than the fee." });
  const data = {
    isActive: input.isActive,
    discountType: input.discountType,
    discountValue: input.discountType === "NONE" ? 0 : input.discountValue,
    discountReason: input.discountType === "NONE" ? null : input.discountReason,
  };
  await ctx.db.studentFee.upsert({
    where: { studentId_feeStructureId: { studentId, feeStructureId: fee.id } },
    create: { organizationId: ctx.orgId, studentId, feeStructureId: fee.id, ...data },
    update: data,
  });
  await auditFor(ctx)({ action: "fee.student_update", entityType: "student", entityId: studentId, after: { fee: fee.name, ...data } });
}
