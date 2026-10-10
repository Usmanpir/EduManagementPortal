import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "@/server/db/client";
import { tenantDb, type TenantDb } from "@/server/db/tenant";
import { AppError, forbidden } from "@/server/http/errors";
import { parseOrgSettings, type OrgSettings } from "@/server/modules/organizations/settings";
import type { PermissionKey } from "@/lib/permissions";
import { getSession } from "./session";

export type TenantContext = {
  sessionId: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    avatarKey: string | null;
    locale: string | null;
  };
  orgId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    country: string;
    timezone: string;
    currency: string;
    locale: string;
    logoKey: string | null;
    primaryColor: string | null;
    onboardingCompletedAt: Date | null;
    status: "ACTIVE" | "SUSPENDED";
  };
  settings: OrgSettings;
  /** Campus the user is currently working in; null = all accessible campuses. */
  campusId: string | null;
  /** Campuses the user may access; null = every campus in the organization. */
  allowedCampusIds: string[] | null;
  permissions: ReadonlySet<PermissionKey>;
  roleKeys: string[];
  staffId: string | null;
  teacherId: string | null;
  guardianId: string | null;
  studentId: string | null;
  db: TenantDb;
};

/** Loads the tenant context for the signed-in user, or null. Memoized per request. */
export const getTenantContext = cache(async (): Promise<TenantContext | null> => {
  const session = await getSession();
  if (!session || !session.user.organizationId) return null;

  const orgId = session.user.organizationId;
  const [organization, userRoles, staff, guardian, student] = await Promise.all([
    db.organization.findUnique({ where: { id: orgId } }),
    db.userRole.findMany({
      where: { userId: session.userId, organizationId: orgId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    }),
    db.staff.findFirst({
      where: { userId: session.userId, organizationId: orgId, deletedAt: null },
      select: { id: true, teacher: { select: { id: true } } },
    }),
    db.guardian.findFirst({ where: { userId: session.userId, organizationId: orgId, deletedAt: null }, select: { id: true } }),
    db.student.findFirst({ where: { userId: session.userId, organizationId: orgId, archivedAt: null }, select: { id: true } }),
  ]);
  if (!organization || organization.deletedAt) return null;

  const permissions = new Set<PermissionKey>();
  let allCampuses = false;
  const campusIds = new Set<string>();
  for (const ur of userRoles) {
    for (const rp of ur.role.permissions) permissions.add(rp.permission.key as PermissionKey);
    if (ur.campusId) campusIds.add(ur.campusId);
    else allCampuses = true;
  }
  const allowedCampusIds = allCampuses ? null : [...campusIds];

  // A stale session campus that is no longer permitted falls back to the default view.
  let campusId = session.campusId;
  if (campusId && allowedCampusIds && !allowedCampusIds.includes(campusId)) campusId = null;
  if (!campusId && allowedCampusIds?.length === 1) campusId = allowedCampusIds[0] ?? null;

  return {
    sessionId: session.id,
    user: {
      id: session.user.id,
      email: session.user.email,
      firstName: session.user.firstName,
      lastName: session.user.lastName,
      avatarKey: session.user.avatarKey,
      locale: session.user.locale,
    },
    orgId,
    organization: {
      id: organization.id,
      name: organization.name,
      slug: organization.slug,
      country: organization.country,
      timezone: organization.timezone,
      currency: organization.currency,
      locale: organization.locale,
      logoKey: organization.logoKey,
      primaryColor: organization.primaryColor,
      onboardingCompletedAt: organization.onboardingCompletedAt,
      status: organization.status,
    },
    settings: parseOrgSettings(organization.settings),
    campusId,
    allowedCampusIds,
    permissions,
    roleKeys: userRoles.map((ur) => ur.role.key),
    staffId: staff?.id ?? null,
    teacherId: staff?.teacher?.id ?? null,
    guardianId: guardian?.id ?? null,
    studentId: student?.id ?? null,
    db: tenantDb(orgId),
  };
});

export function can(ctx: Pick<TenantContext, "permissions">, ...perms: PermissionKey[]): boolean {
  return perms.every((p) => ctx.permissions.has(p));
}

export function canAny(ctx: Pick<TenantContext, "permissions">, ...perms: PermissionKey[]): boolean {
  return perms.some((p) => ctx.permissions.has(p));
}

/** Throws a FORBIDDEN AppError unless the user has every listed permission. */
export function assertCan(ctx: Pick<TenantContext, "permissions">, ...perms: PermissionKey[]) {
  if (!can(ctx, ...perms)) throw forbidden();
}

/** For server components: redirects anonymous users and renders 403 for missing permissions. */
export async function requirePageContext(...perms: PermissionKey[]): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) {
    const session = await getSession();
    if (session?.user.isSuperAdmin) redirect("/admin");
    redirect("/login");
  }
  if (perms.length && !can(ctx, ...perms)) redirect("/forbidden");
  return ctx;
}

/** For route handlers. */
export async function requireApiContext(...perms: PermissionKey[]): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) throw new AppError("UNAUTHORIZED", "Please sign in to continue.");
  assertCan(ctx, ...perms);
  return ctx;
}

/** Prisma `where` fragment restricting a campus-owned model to the active/allowed campuses. */
export function campusScope(ctx: Pick<TenantContext, "campusId" | "allowedCampusIds">): { campusId?: string | { in: string[] } } {
  if (ctx.campusId) return { campusId: ctx.campusId };
  if (ctx.allowedCampusIds) return { campusId: { in: ctx.allowedCampusIds } };
  return {};
}

/** Ensures a campus id supplied by a client is one this user may work in. */
export function assertCampusAccess(ctx: Pick<TenantContext, "allowedCampusIds">, campusId: string) {
  if (ctx.allowedCampusIds && !ctx.allowedCampusIds.includes(campusId)) {
    throw forbidden("You don't have access to that campus.");
  }
}

export function isPortalUser(ctx: Pick<TenantContext, "roleKeys" | "staffId">) {
  return !ctx.staffId && ctx.roleKeys.every((k) => k === "parent" || k === "student");
}
