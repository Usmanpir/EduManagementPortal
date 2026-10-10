import "server-only";
import type { TenantContext } from "@/server/auth/context";

/** Timeline for one record: its own audit events plus documents attached to it. */
export async function recordActivity(ctx: TenantContext, entityType: string, entityId: string, take = 30) {
  const rows = await ctx.db.auditLog.findMany({
    where: {
      OR: [
        { entityType, entityId },
        { entityType: "document", after: { path: ["entityId"], equals: entityId } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take,
    select: { id: true, action: true, userId: true, createdAt: true },
  });
  const ids = [...new Set(rows.map((r) => r.userId).filter((x): x is string => !!x))];
  const users = ids.length ? await ctx.db.user.findMany({ where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true } }) : [];
  const names = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));
  return rows.map((r) => ({ id: r.id, action: r.action, user: r.userId ? (names.get(r.userId) ?? "Former user") : "System", createdAt: r.createdAt.toISOString() }));
}
