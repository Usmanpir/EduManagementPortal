import type { Metadata } from "next";
import { requirePageContext } from "@/server/auth/context";
import { listNotifications, unreadCount } from "@/server/modules/communication/notifications";
import { todayIn } from "@/lib/format";
import { NotificationsView } from "./notifications-view";

export const metadata: Metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: PageProps<"/notifications">) {
  const ctx = await requirePageContext();
  const unreadOnly = (await searchParams).filter === "unread";
  const [page, unread] = await Promise.all([listNotifications(ctx.user.id, { limit: 30, unreadOnly }), unreadCount(ctx.user.id)]);
  return (
    <NotificationsView
      key={String(unreadOnly)}
      initial={page.items.map((i) => ({ ...i, readAt: i.readAt?.toISOString() ?? null, createdAt: i.createdAt.toISOString() }))}
      nextCursor={page.nextCursor}
      unread={unread}
      unreadOnly={unreadOnly}
      canSettings={ctx.permissions.has("settings.manage")}
      today={todayIn(ctx.organization.timezone)}
      timezone={ctx.organization.timezone}
    />
  );
}
