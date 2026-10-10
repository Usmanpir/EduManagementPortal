import "server-only";
import type { z } from "zod";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/server/db/client";
import { env } from "@/server/env";
import { audit, auditFor } from "@/server/audit";
import { assertCampusAccess, type TenantContext } from "@/server/auth/context";
import { hashPassword, hashToken, randomToken } from "@/server/auth/crypto";
import { createSession, destroyAllSessions } from "@/server/auth/session";
import { AppError, badRequest, conflict, forbidden, notFound } from "@/server/http/errors";
import { queueDelivery, sendNow } from "@/server/modules/communication/delivery";
import { slugify } from "@/server/modules/organizations/provision";
import { ALL_PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import type { acceptInviteSchema } from "@/lib/validation/auth";
import type { inviteUserSchema, roleSchema, updateUserSchema } from "@/lib/validation/organization";
import { nameMatch } from "@/server/db/search";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// ── Guards ──

/** Users may only grant roles whose every permission they hold themselves (no privilege escalation). */
async function assertCanGrantRole(ctx: TenantContext, roleId: string) {
  const role = await ctx.db.role.findFirst({
    where: { id: roleId },
    include: { permissions: { include: { permission: { select: { key: true } } } } },
  });
  if (!role) throw notFound("Role");
  const missing = role.permissions.map((p) => p.permission.key).filter((k) => !ctx.permissions.has(k as PermissionKey));
  if (missing.length) throw forbidden(`You can't assign the ${role.name} role because it has permissions you don't have.`);
  return role;
}

function assertCanGrantPermissions(ctx: TenantContext, permissions: string[]) {
  const missing = permissions.filter((p) => !ctx.permissions.has(p as PermissionKey));
  if (missing.length) throw forbidden("You can't grant permissions that you don't have yourself.");
}

/** At least one active administrator must always remain. */
async function assertKeepsAnAdmin(ctx: TenantContext, excludingUserId: string) {
  const remaining = await ctx.db.userRole.count({
    where: { role: { key: "admin" }, userId: { not: excludingUserId }, user: { status: "ACTIVE", deletedAt: null } },
  });
  if (remaining === 0) throw badRequest("This organization needs at least one active administrator.");
}

// ── Users ──

export type UserListParams = { q?: string; role?: string[]; status?: string[]; page: number; pageSize: number };

export async function listUsers(ctx: TenantContext, params: UserListParams) {
  const where: Prisma.UserWhereInput = {
    deletedAt: null,
    ...(params.q
      ? {
          OR: [
            nameMatch(params.q),
            { email: { contains: params.q, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(params.role?.length ? { roles: { some: { role: { key: { in: params.role } } } } } : {}),
    ...(params.status?.length ? { status: { in: params.status as ("ACTIVE" | "DISABLED" | "INVITED")[] } } : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.db.user.findMany({
      where,
      orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        status: true,
        lastLoginAt: true,
        createdAt: true,
        roles: { select: { roleId: true, campusId: true, role: { select: { key: true, name: true } }, campus: { select: { name: true } } } },
      },
    }),
    ctx.db.user.count({ where }),
  ]);
  return {
    total,
    rows: rows.map((u) => ({
      id: u.id,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`.trim(),
      status: u.status,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      roles: u.roles.map((r) => ({ roleId: r.roleId, key: r.role.key, name: r.role.name, campusId: r.campusId, campusName: r.campus?.name ?? null })),
    })),
  };
}

export async function updateUser(ctx: TenantContext, userId: string, input: z.output<typeof updateUserSchema>) {
  const user = await ctx.db.user.findFirst({ where: { id: userId, deletedAt: null }, include: { roles: true } });
  if (!user) throw notFound("User");

  if (input.roles) {
    for (const assignment of input.roles) {
      await assertCanGrantRole(ctx, assignment.roleId);
      if (assignment.campusId) {
        assertCampusAccess(ctx, assignment.campusId);
        const campus = await ctx.db.campus.findFirst({ where: { id: assignment.campusId, deletedAt: null }, select: { id: true } });
        if (!campus) throw notFound("Campus");
      }
    }
    // Removing roles is also a grant decision: you can't strip a role you couldn't give.
    for (const existing of user.roles) await assertCanGrantRole(ctx, existing.roleId);

    const adminRole = await ctx.db.role.findFirst({ where: { key: "admin" }, select: { id: true } });
    const keepsAdmin = input.roles.some((r) => r.roleId === adminRole?.id);
    if (!keepsAdmin && user.roles.some((r) => r.roleId === adminRole?.id)) await assertKeepsAnAdmin(ctx, userId);

    const unique = [...new Map(input.roles.map((r) => [`${r.roleId}:${r.campusId ?? ""}`, r])).values()];
    await ctx.db.$transaction([
      ctx.db.userRole.deleteMany({ where: { userId } }),
      ctx.db.userRole.createMany({ data: unique.map((r) => ({ organizationId: ctx.orgId, userId, roleId: r.roleId, campusId: r.campusId })) }),
    ]);
    await auditFor(ctx)({ action: "user.roles_update", entityType: "user", entityId: userId, before: user.roles, after: unique });
  }

  if (input.status && input.status !== user.status) {
    if (userId === ctx.user.id && input.status === "DISABLED") throw badRequest("You can't disable your own account.");
    if (input.status === "DISABLED") {
      const isAdmin = await ctx.db.userRole.count({ where: { userId, role: { key: "admin" } } });
      if (isAdmin) await assertKeepsAnAdmin(ctx, userId);
    }
    await ctx.db.user.update({ where: { id: userId }, data: { status: input.status } });
    if (input.status === "DISABLED") await destroyAllSessions(userId);
    await auditFor(ctx)({ action: input.status === "DISABLED" ? "user.disable" : "user.enable", entityType: "user", entityId: userId });
  }
}

// ── Invitations ──

export async function listPendingInvitations(ctx: TenantContext) {
  const rows = await ctx.db.invitation.findMany({
    where: { acceptedAt: null, revokedAt: null },
    orderBy: { createdAt: "desc" },
    include: { role: { select: { name: true } } },
  });
  const campusIds = rows.map((r) => r.campusId).filter((id): id is string => !!id);
  const campuses = campusIds.length ? await ctx.db.campus.findMany({ where: { id: { in: campusIds } }, select: { id: true, name: true } }) : [];
  const campusName = new Map(campuses.map((c) => [c.id, c.name]));
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    roleName: r.role.name,
    campusName: r.campusId ? (campusName.get(r.campusId) ?? null) : null,
    expiresAt: r.expiresAt.toISOString(),
    expired: r.expiresAt < new Date(),
    createdAt: r.createdAt.toISOString(),
  }));
}

async function sendInvitationEmail(ctx: TenantContext, invitationId: string, email: string, token: string, roleName: string) {
  await sendNow({
    organizationId: ctx.orgId,
    channel: "EMAIL",
    recipient: email,
    templateKey: "invitation",
    payload: {
      inviterName: `${ctx.user.firstName} ${ctx.user.lastName}`,
      roleName,
      url: `${env.APP_URL}/invite/${token}`,
    },
    dedupeKey: `invitation:${invitationId}:${hashToken(token).slice(0, 12)}`,
  });
}

export async function inviteUser(ctx: TenantContext, input: z.output<typeof inviteUserSchema>) {
  const role = await assertCanGrantRole(ctx, input.roleId);
  if (input.campusId) assertCampusAccess(ctx, input.campusId);

  const existing = await db.user.findUnique({ where: { email: input.email }, select: { organizationId: true } });
  if (existing) {
    const message = existing.organizationId === ctx.orgId ? "This person is already a member of your organization." : "This email already has an EduAttend account.";
    throw conflict(message, { email: message });
  }
  // Replace any outstanding invitation for the same email.
  await ctx.db.invitation.updateMany({ where: { email: input.email, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });

  const token = randomToken();
  const invitation = await ctx.db.invitation.create({
    data: {
      organizationId: ctx.orgId,
      email: input.email,
      roleId: role.id,
      campusId: input.campusId,
      tokenHash: hashToken(token),
      invitedById: ctx.user.id,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });
  await sendInvitationEmail(ctx, invitation.id, input.email, token, role.name);
  await auditFor(ctx)({ action: "user.invite", entityType: "invitation", entityId: invitation.id, after: { email: input.email, role: role.key } });
  return { id: invitation.id };
}

export async function resendInvitation(ctx: TenantContext, invitationId: string) {
  const invitation = await ctx.db.invitation.findFirst({ where: { id: invitationId, acceptedAt: null, revokedAt: null }, include: { role: true } });
  if (!invitation) throw notFound("Invitation");
  // A fresh token invalidates the old link.
  const token = randomToken();
  await ctx.db.invitation.update({ where: { id: invitationId }, data: { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) } });
  await sendInvitationEmail(ctx, invitationId, invitation.email, token, invitation.role.name);
  await auditFor(ctx)({ action: "user.invite_resend", entityType: "invitation", entityId: invitationId });
}

export async function revokeInvitation(ctx: TenantContext, invitationId: string) {
  const result = await ctx.db.invitation.updateMany({ where: { id: invitationId, acceptedAt: null, revokedAt: null }, data: { revokedAt: new Date() } });
  if (result.count === 0) throw notFound("Invitation");
  await auditFor(ctx)({ action: "user.invite_revoke", entityType: "invitation", entityId: invitationId });
}

/** Public lookup used by the invitation page. Returns nothing sensitive. */
export async function getInvitationByToken(token: string) {
  const invitation = await db.invitation.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { organization: { select: { name: true } }, role: { select: { name: true } } },
  });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date()) return null;
  return { email: invitation.email, organizationName: invitation.organization.name, roleName: invitation.role.name };
}

export async function acceptInvitation(input: z.output<typeof acceptInviteSchema>) {
  const invitation = await db.invitation.findUnique({ where: { tokenHash: hashToken(input.token) } });
  if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt < new Date()) {
    throw new AppError("BAD_REQUEST", "This invitation is invalid or has expired. Ask your administrator to send a new one.");
  }
  if (await db.user.findUnique({ where: { email: invitation.email }, select: { id: true } })) {
    throw conflict("An account with this email already exists. Sign in instead.");
  }

  const passwordHash = await hashPassword(input.password);
  const user = await db.$transaction(async (tx) => {
    // Claim the invitation first so a double-submit can't create two accounts.
    const claimed = await tx.invitation.updateMany({ where: { id: invitation.id, acceptedAt: null }, data: { acceptedAt: new Date() } });
    if (claimed.count === 0) throw new AppError("BAD_REQUEST", "This invitation has already been used.");
    const created = await tx.user.create({
      data: {
        organizationId: invitation.organizationId,
        email: invitation.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        emailVerifiedAt: new Date(),
      },
    });
    await tx.userRole.create({
      data: { organizationId: invitation.organizationId, userId: created.id, roleId: invitation.roleId, campusId: invitation.campusId },
    });
    // Connect the new login to the person record it was created for (matched by email).
    const match = { organizationId: invitation.organizationId, email: { equals: invitation.email, mode: "insensitive" as const }, userId: null };
    const staff = await tx.staff.findFirst({ where: { ...match, deletedAt: null }, select: { id: true } });
    if (staff) await tx.staff.update({ where: { id: staff.id }, data: { userId: created.id } });
    const guardian = await tx.guardian.findFirst({ where: { ...match, deletedAt: null }, select: { id: true } });
    if (guardian) await tx.guardian.update({ where: { id: guardian.id }, data: { userId: created.id } });
    const student = await tx.student.findFirst({ where: { ...match, archivedAt: null }, select: { id: true } });
    if (student && !staff && !guardian) await tx.student.update({ where: { id: student.id }, data: { userId: created.id } });
    return created;
  });

  await createSession(user.id, { remember: true, campusId: invitation.campusId });
  await audit({ organizationId: invitation.organizationId, userId: user.id, action: "user.invite_accept", entityType: "user", entityId: user.id });
  return { redirectTo: "/dashboard" };
}

// ── Profile ──

export async function updateProfile(ctx: TenantContext, input: { firstName: string; lastName: string; phone: string | null }) {
  await db.user.update({ where: { id: ctx.user.id }, data: input });
  await auditFor(ctx)({ action: "user.profile_update", entityType: "user", entityId: ctx.user.id, after: input });
}

export async function listSessions(userId: string, currentSessionId: string) {
  const sessions = await db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, ipAddress: true, userAgent: true, lastSeenAt: true, createdAt: true },
  });
  return sessions.map((s) => ({ ...s, current: s.id === currentSessionId, lastSeenAt: s.lastSeenAt.toISOString(), createdAt: s.createdAt.toISOString() }));
}

export async function revokeSession(ctx: TenantContext, sessionId: string) {
  if (sessionId === ctx.sessionId) throw badRequest("Use Sign out to end your current session.");
  const result = await db.session.deleteMany({ where: { id: sessionId, userId: ctx.user.id } });
  if (result.count === 0) throw notFound("Session");
  await auditFor(ctx)({ action: "auth.session_revoke", entityType: "session", entityId: sessionId });
}

// ── Roles ──

export async function listRoles(ctx: TenantContext) {
  const roles = await ctx.db.role.findMany({
    orderBy: [{ isSystem: "desc" }, { name: "asc" }],
    include: {
      permissions: { include: { permission: { select: { key: true } } } },
      _count: { select: { users: true } },
    },
  });
  const order = ["admin", "principal", "teacher", "accountant", "staff", "parent", "student"];
  return roles
    .map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      users: r._count.users,
      permissions: r.permissions.map((p) => p.permission.key),
    }))
    .sort((a, b) => {
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.name.localeCompare(b.name);
    });
}

async function permissionIds(keys: string[]) {
  const rows = await db.permission.findMany({ where: { key: { in: keys } }, select: { id: true } });
  return rows.map((r) => r.id);
}

export async function createRole(ctx: TenantContext, input: z.output<typeof roleSchema>) {
  assertCanGrantPermissions(ctx, input.permissions);
  const key = `custom-${slugify(input.name)}`.slice(0, 48);
  if (await ctx.db.role.findFirst({ where: { key }, select: { id: true } })) {
    throw conflict("A role with this name already exists.", { name: "A role with this name already exists." });
  }
  const role = await ctx.db.role.create({ data: { organizationId: ctx.orgId, key, name: input.name, description: input.description } });
  const ids = await permissionIds(input.permissions);
  if (ids.length) await db.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId: role.id, permissionId })) });
  await auditFor(ctx)({ action: "role.create", entityType: "role", entityId: role.id, after: input });
  return role;
}

export async function updateRole(ctx: TenantContext, roleId: string, input: z.output<typeof roleSchema>) {
  const role = await ctx.db.role.findFirst({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
  if (!role) throw notFound("Role");
  const before = role.permissions.map((p) => p.permission.key);

  if (role.key === "admin") {
    // The administrator role always keeps every permission so the organization can't lock itself out.
    if (input.permissions.length !== ALL_PERMISSIONS.length) throw badRequest("The Administrator role always has full access.");
  }
  // Both adding and removing permissions require holding them.
  const changed = [...input.permissions.filter((p) => !before.includes(p)), ...before.filter((p) => !input.permissions.includes(p))];
  assertCanGrantPermissions(ctx, changed);

  await ctx.db.role.update({ where: { id: roleId }, data: { name: role.isSystem ? role.name : input.name, description: input.description } });
  const ids = await permissionIds(input.permissions);
  await db.$transaction([
    db.rolePermission.deleteMany({ where: { roleId } }),
    db.rolePermission.createMany({ data: ids.map((permissionId) => ({ roleId, permissionId })) }),
  ]);
  await auditFor(ctx)({ action: "role.update", entityType: "role", entityId: roleId, before: { permissions: before }, after: { permissions: input.permissions } });
}

export async function deleteRole(ctx: TenantContext, roleId: string) {
  const role = await ctx.db.role.findFirst({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
  if (!role) throw notFound("Role");
  if (role.isSystem) throw badRequest("Built-in roles can't be deleted.");
  if (role._count.users > 0) throw badRequest(`${role._count.users} users still have this role. Reassign them first.`);
  await ctx.db.role.delete({ where: { id: roleId } });
  await auditFor(ctx)({ action: "role.delete", entityType: "role", entityId: roleId, before: role });
}

// ── Platform helpers ──

/** Queues the welcome-type email for accounts created by staff (e.g. parent portal access). */
export async function queueAccountEmail(organizationId: string, userId: string, email: string, firstName: string) {
  await queueDelivery({
    organizationId,
    channel: "EMAIL",
    recipient: email,
    templateKey: "welcome",
    payload: { firstName, url: `${env.APP_URL}/login` },
    dedupeKey: `account:${userId}`,
  });
}
