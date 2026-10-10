import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { auditFor } from "@/server/audit";
import { assertCampusAccess, type TenantContext } from "@/server/auth/context";
import { badRequest, conflict, notFound } from "@/server/http/errors";
import { assertWithinLimit } from "@/server/modules/billing/limits";
import type { campusSchema, organizationGeneralSchema } from "@/lib/validation/organization";
import { orgSettingsSchema, parseOrgSettings, type OrgSettings } from "./settings";

export async function getOrganizationProfile(ctx: TenantContext) {
  return ctx.db.organization.findUniqueOrThrow({
    where: { id: ctx.orgId },
    select: {
      id: true,
      name: true,
      legalName: true,
      email: true,
      phone: true,
      website: true,
      address: true,
      country: true,
      timezone: true,
      currency: true,
      locale: true,
      primaryColor: true,
      logoKey: true,
    },
  });
}

export async function updateOrganizationGeneral(ctx: TenantContext, input: z.output<typeof organizationGeneralSchema>) {
  const before = await getOrganizationProfile(ctx);
  const after = await ctx.db.organization.update({ where: { id: ctx.orgId }, data: input });
  await auditFor(ctx)({ action: "organization.update", entityType: "organization", entityId: ctx.orgId, before, after: input });
  return after;
}

/** Deep-merges a partial settings update, validates the whole object, and saves it. */
export async function updateOrganizationSettings(ctx: TenantContext, patch: Partial<{ [K in keyof OrgSettings]: Partial<OrgSettings[K]> }>, action = "settings.update") {
  const org = await ctx.db.organization.findUniqueOrThrow({ where: { id: ctx.orgId }, select: { settings: true } });
  const current = parseOrgSettings(org.settings);
  const merged: Record<string, unknown> = { ...current };
  for (const [section, value] of Object.entries(patch)) {
    merged[section] = { ...(current[section as keyof OrgSettings] as object), ...(value as object) };
  }
  const next = orgSettingsSchema.parse(merged);
  await ctx.db.organization.update({ where: { id: ctx.orgId }, data: { settings: next as Prisma.InputJsonValue } });
  await auditFor(ctx)({ action, entityType: "organization", entityId: ctx.orgId, before: pick(current, patch), after: pick(next, patch) });
  return next;
}

function pick(settings: OrgSettings, patch: object) {
  return Object.fromEntries(Object.keys(patch).map((k) => [k, settings[k as keyof OrgSettings]]));
}

// ── Campuses ──

export async function listCampuses(ctx: TenantContext) {
  const campuses = await ctx.db.campus.findMany({
    where: { deletedAt: null, ...(ctx.allowedCampusIds ? { id: { in: ctx.allowedCampusIds } } : {}) },
    orderBy: [{ isMain: "desc" }, { name: "asc" }],
    include: {
      _count: {
        select: {
          students: { where: { archivedAt: null, status: "ACTIVE" } },
          staff: { where: { deletedAt: null } },
          classes: { where: { deletedAt: null } },
        },
      },
    },
  });
  return campuses.map((c) => ({
    id: c.id,
    name: c.name,
    code: c.code,
    city: c.city,
    address: c.address,
    phone: c.phone,
    email: c.email,
    isMain: c.isMain,
    students: c._count.students,
    staff: c._count.staff,
    classes: c._count.classes,
  }));
}

export async function createCampus(ctx: TenantContext, input: z.output<typeof campusSchema>) {
  await assertWithinLimit(ctx.orgId, "campuses");
  const taken = await ctx.db.campus.findFirst({ where: { code: input.code }, select: { id: true } });
  if (taken) throw conflict("Another campus already uses this code.", { code: "Another campus already uses this code." });
  const campus = await ctx.db.campus.create({ data: { organizationId: ctx.orgId, ...input } });
  await auditFor(ctx)({ action: "campus.create", entityType: "campus", entityId: campus.id, after: campus });
  return campus;
}

export async function updateCampus(ctx: TenantContext, id: string, input: z.output<typeof campusSchema>) {
  assertCampusAccess(ctx, id);
  const before = await ctx.db.campus.findFirst({ where: { id, deletedAt: null } });
  if (!before) throw notFound("Campus");
  if (input.code !== before.code) {
    const taken = await ctx.db.campus.findFirst({ where: { code: input.code, NOT: { id } }, select: { id: true } });
    if (taken) throw conflict("Another campus already uses this code.", { code: "Another campus already uses this code." });
  }
  const after = await ctx.db.campus.update({ where: { id }, data: input });
  await auditFor(ctx)({ action: "campus.update", entityType: "campus", entityId: id, before, after });
  return after;
}

/** Archives a campus. Historical records stay intact; the main campus can't be archived. */
export async function archiveCampus(ctx: TenantContext, id: string) {
  assertCampusAccess(ctx, id);
  const campus = await ctx.db.campus.findFirst({
    where: { id, deletedAt: null },
    include: { _count: { select: { students: { where: { archivedAt: null, status: "ACTIVE" } } } } },
  });
  if (!campus) throw notFound("Campus");
  if (campus.isMain) throw badRequest("The main campus can't be archived. Make another campus the main campus first.");
  if (campus._count.students > 0) {
    throw badRequest(`This campus still has ${campus._count.students} active students. Move or archive them first.`);
  }
  await ctx.db.campus.update({ where: { id }, data: { deletedAt: new Date() } });
  await ctx.db.userRole.deleteMany({ where: { campusId: id } });
  await auditFor(ctx)({ action: "campus.archive", entityType: "campus", entityId: id, before: campus });
}

export async function setMainCampus(ctx: TenantContext, id: string) {
  const campus = await ctx.db.campus.findFirst({ where: { id, deletedAt: null } });
  if (!campus) throw notFound("Campus");
  await ctx.db.$transaction([
    ctx.db.campus.updateMany({ where: { isMain: true }, data: { isMain: false } }),
    ctx.db.campus.update({ where: { id }, data: { isMain: true } }),
  ]);
  await auditFor(ctx)({ action: "campus.set_main", entityType: "campus", entityId: id });
}
