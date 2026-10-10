import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { TenantContext } from "@/server/auth/context";

export type AuditListParams = { q?: string; entity?: string[]; page: number; pageSize: number };

export async function listAuditLogs(ctx: TenantContext, params: AuditListParams) {
  const where: Prisma.AuditLogWhereInput = {
    ...(params.entity?.length ? { entityType: { in: params.entity } } : {}),
    ...(params.q ? { OR: [{ action: { contains: params.q, mode: "insensitive" } }, { entityId: params.q }] } : {}),
  };
  const [rows, total] = await Promise.all([
    ctx.db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (params.page - 1) * params.pageSize,
      take: params.pageSize,
    }),
    ctx.db.auditLog.count({ where }),
  ]);
  const userIds = [...new Set(rows.map((r) => r.userId).filter((id): id is string => !!id))];
  const users = userIds.length
    ? await ctx.db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true, email: true } })
    : [];
  const byId = new Map(users.map((u) => [u.id, u]));
  return {
    total,
    rows: rows.map((r) => {
      const u = r.userId ? byId.get(r.userId) : null;
      return {
        id: r.id,
        action: r.action,
        entityType: r.entityType,
        entityId: r.entityId,
        user: u ? `${u.firstName} ${u.lastName}` : r.userId ? "Former user" : "System",
        userEmail: u?.email ?? null,
        ipAddress: r.ipAddress,
        before: r.before,
        after: r.after,
        createdAt: r.createdAt.toISOString(),
      };
    }),
  };
}

export async function auditEntityTypes(ctx: TenantContext) {
  const rows = await ctx.db.auditLog.groupBy({ by: ["entityType"], _count: true, orderBy: { entityType: "asc" } });
  return rows.map((r) => r.entityType);
}
