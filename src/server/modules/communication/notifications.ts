import "server-only";
import { db } from "@/server/db/client";

export type NotificationType =
  | "attendance.absent"
  | "attendance.late"
  | "attendance.low"
  | "attendance.pending"
  | "fee.payment"
  | "fee.reminder"
  | "fee.overdue"
  | "leave.requested"
  | "leave.reviewed"
  | "announcement"
  | "exam.scheduled"
  | "result.published"
  | "import.completed"
  | "system";

export type NewNotification = {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  /** Same (user, key) pair is only ever stored once — makes jobs retry-safe. */
  dedupeKey?: string | null;
};

/** Creates in-app notifications for an organization. Duplicate dedupe keys are ignored. */
export async function notifyUsers(organizationId: string | null, notifications: NewNotification[]) {
  if (notifications.length === 0) return 0;
  const result = await db.notification.createMany({
    data: notifications.map((n) => ({
      organizationId,
      userId: n.userId,
      type: n.type,
      title: n.title,
      body: n.body,
      link: n.link ?? null,
      entityType: n.entityType ?? null,
      entityId: n.entityId ?? null,
      dedupeKey: n.dedupeKey ?? null,
    })),
    skipDuplicates: true,
  });
  return result.count;
}

export async function listNotifications(userId: string, opts: { limit: number; cursor?: string | null; unreadOnly?: boolean }) {
  const rows = await db.notification.findMany({
    where: { userId, ...(opts.unreadOnly ? { readAt: null } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: opts.limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true },
  });
  const hasMore = rows.length > opts.limit;
  const items = hasMore ? rows.slice(0, opts.limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}

export function unreadCount(userId: string) {
  return db.notification.count({ where: { userId, readAt: null } });
}

/** Marks the given notifications (or all) as read — only ever the caller's own. */
export async function markRead(userId: string, ids: string[] | "all") {
  const result = await db.notification.updateMany({
    where: { userId, readAt: null, ...(ids === "all" ? {} : { id: { in: ids } }) },
    data: { readAt: new Date() },
  });
  return result.count;
}

/** Users holding any of the given permissions in an organization (e.g. who should hear about leave requests). */
export async function usersWithPermission(organizationId: string, permissionKeys: string[], campusId?: string | null) {
  const rows = await db.userRole.findMany({
    where: {
      organizationId,
      user: { status: "ACTIVE", deletedAt: null },
      role: { permissions: { some: { permission: { key: { in: permissionKeys } } } } },
      ...(campusId ? { OR: [{ campusId: null }, { campusId }] } : {}),
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.map((r) => r.userId);
}
